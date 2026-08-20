/**
 * KYC — identity verification.
 *
 * Real infrastructure around a mock check: submission, validation, document
 * storage, and an approve/reject lifecycle are all real and permanent. The
 * one piece that is not real is the identity check itself — see
 * kycVerification.js, which is the only file that would need to change to
 * plug in an actual provider.
 *
 * Sensitive by design: the full submission (legal name, date of birth, ID
 * number, document photos) never appears on the user record returned by
 * general-purpose routes (`/me`, escrow buyer/seller summaries, the admin
 * user list). It is reachable only through the routes in this file and in
 * routes/admin.js, each of which shows exactly as much as its audience
 * needs — the caller sees their own masked number, an admin reviewing a
 * submission sees the real one.
 */

import { users, kycDocuments } from '../store/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { recalculate } from './scoreEngine.js';
import { runMockVerification } from './kycVerification.js';

export const ID_TYPES = ['nin', 'bvn', 'passport', 'drivers_license'];
export const DOCUMENT_TYPES = ['id_front', 'id_back', 'selfie'];

/** The tier each id type is worth once a human has approved it — same ladder scoreEngine already scores. */
const TIER_FOR_ID_TYPE = {
  nin: 'bvn_nin',
  bvn: 'bvn_nin',
  passport: 'bvn_nin',
  drivers_license: 'bvn_nin',
};

export const STATUS_FLOW = {
  none: ['pending'],
  pending: ['verified', 'rejected'],
  rejected: ['pending'],
  verified: [],
};

/** Ceiling on one document photo, as base64 characters — same figure escrowEngine's delivery-proof upload uses. */
const MAX_DOC_CHARS = 700_000;
const DOC_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DOCUMENTS = 2;

const ID_NUMBER_PATTERNS = {
  nin: /^\d{11}$/,
  bvn: /^\d{11}$/,
  passport: /^[A-Za-z]\d{8}$/,
  drivers_license: /^[A-Za-z0-9-]{6,20}$/,
};

const ID_NUMBER_HINT = {
  nin: 'A NIN is 11 digits.',
  bvn: 'A BVN is 11 digits.',
  passport: 'A Nigerian passport number looks like A12345678.',
  drivers_license: '6-20 letters, numbers or hyphens.',
};

function assertTransition(from, to) {
  if (!STATUS_FLOW[from]?.includes(to)) {
    throw conflict(`A KYC submission that is "${from}" cannot move to "${to}".`, { from, to });
  }
}

/** Never the full number — the last 4 characters are enough for someone to recognise their own submission. */
function maskIdNumber(idNumber) {
  const value = String(idNumber ?? '');
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
}

/** What the account owner sees. No document image data, no full ID number. */
function selfView(user) {
  const kyc = user.kyc;
  if (!kyc || kyc.status === 'none') return { status: 'none' };

  return {
    status: kyc.status,
    legalName: kyc.legalName,
    dateOfBirth: kyc.dateOfBirth,
    idType: kyc.idType,
    idNumberMasked: maskIdNumber(kyc.idNumber),
    documentCount: kyc.documentIds?.length ?? 0,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt ?? null,
    rejectionReason: kyc.status === 'rejected' ? kyc.rejectionReason ?? null : null,
  };
}

/** What an admin sees reviewing a submission. The real ID number, because that is the whole job. */
function adminView(user) {
  const kyc = user.kyc;
  if (!kyc || kyc.status === 'none') return null;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    status: kyc.status,
    legalName: kyc.legalName,
    dateOfBirth: kyc.dateOfBirth,
    idType: kyc.idType,
    idNumber: kyc.idNumber,
    documentIds: kyc.documentIds ?? [],
    mockVerification: kyc.mockVerification ?? null,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt ?? null,
    reviewedBy: kyc.reviewedBy ?? null,
    rejectionReason: kyc.rejectionReason ?? null,
    submissionCount: kyc.submissionCount ?? 1,
  };
}

export function getStatus(userId) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');
  return selfView(user);
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function assertAdult(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) throw badRequest('Enter a valid date of birth.');
  if (dob.getTime() > Date.now()) throw badRequest('Date of birth cannot be in the future.');

  const ageMs = Date.now() - dob.getTime();
  const ageYears = ageMs / (365.25 * 864e5);
  if (ageYears < 18) throw badRequest('You must be at least 18 years old to verify your identity.');
  if (ageYears > 120) throw badRequest('Enter a valid date of birth.');
}

function storeDocument(userId, doc) {
  const dataUrl = String(doc?.dataUrl ?? '');
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw badRequest('Upload each document as a photo.');

  const [, contentType, payload] = match;
  if (!DOC_CONTENT_TYPES.includes(contentType.toLowerCase())) {
    throw badRequest('Documents must be a JPEG, PNG or WebP image.');
  }
  if (payload.length > MAX_DOC_CHARS) {
    throw badRequest('One of your documents is too large. Around 1MB or less, please.');
  }

  const docType = DOCUMENT_TYPES.includes(doc?.type) ? doc.type : 'id_front';
  const id = randomId('kyd');
  const createdAt = new Date().toISOString();

  kycDocuments.set(id, {
    id,
    userId,
    docType,
    contentType,
    dataUrl,
    fileName: doc?.fileName ? String(doc.fileName).slice(0, 120) : null,
    byteSize: Math.floor((payload.length * 3) / 4),
    createdAt,
  });

  return id;
}

/**
 * Submits (or resubmits, after a rejection) a KYC application.
 *
 * A user with a `pending` submission cannot submit again — one open review
 * at a time. A `verified` user cannot submit again either; there is nothing
 * left to prove. `none` and `rejected` are the only states this accepts from.
 */
export async function submit(userId, body) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');

  const currentStatus = user.kyc?.status ?? 'none';
  assertTransition(currentStatus, 'pending');

  const legalName = String(body?.legalName ?? '').trim();
  if (legalName.length < 2 || legalName.length > 120) {
    throw badRequest('Enter your full legal name as it appears on your ID.');
  }

  assertAdult(body?.dateOfBirth);
  const dateOfBirth = new Date(body.dateOfBirth).toISOString().slice(0, 10);

  const idType = String(body?.idType ?? '');
  if (!ID_TYPES.includes(idType)) throw badRequest(`idType must be one of: ${ID_TYPES.join(', ')}`);

  const idNumber = String(body?.idNumber ?? '').trim().toUpperCase();
  if (!ID_NUMBER_PATTERNS[idType].test(idNumber)) {
    throw badRequest(`That does not look like a valid ${idType.replace('_', ' ')} number. ${ID_NUMBER_HINT[idType]}`);
  }

  const documents = Array.isArray(body?.documents) ? body.documents : [];
  if (documents.length === 0) throw badRequest('Upload at least one photo of your ID.');
  if (documents.length > MAX_DOCUMENTS) throw badRequest(`Upload at most ${MAX_DOCUMENTS} documents.`);

  const documentIds = documents.map((doc) => storeDocument(userId, doc));

  // The mock check is advisory — it never sets the status itself. See kycVerification.js.
  const mockVerification = await runMockVerification({ legalName, idType, idNumber });

  const now = new Date().toISOString();
  const previousAttempts = user.kyc?.submissionCount ?? 0;

  users.update(userId, {
    kyc: {
      status: 'pending',
      legalName,
      dateOfBirth,
      idType,
      idNumber,
      documentIds,
      mockVerification,
      submittedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      submissionCount: previousAttempts + 1,
    },
  });

  return selfView(users.get(userId));
}

/* ------------------------------------------------------------------ *
 * Document access — the account owner or an admin, nobody else. Mirrors
 * escrowEngine.deliveryProof's split exactly.
 * ------------------------------------------------------------------ */
export function document(docId, requesterId) {
  const doc = kycDocuments.get(docId);
  if (!doc) throw notFound('That document is no longer available.');

  const requester = users.get(requesterId);
  if (doc.userId !== requesterId && requester?.role !== 'admin') {
    throw forbidden('You do not have access to this document.');
  }

  return {
    id: doc.id,
    docType: doc.docType,
    dataUrl: doc.dataUrl,
    contentType: doc.contentType,
    fileName: doc.fileName,
    byteSize: doc.byteSize,
    uploadedAt: doc.createdAt,
  };
}

/* ------------------------------------------------------------------ *
 * Admin review — the only place a submission can become verified or
 * rejected. Never reachable by the submitter themselves.
 * ------------------------------------------------------------------ */

export function pendingForAdmin() {
  return users
    .find((u) => u.kyc?.status === 'pending')
    .map(adminView)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export function detailForAdmin(userId) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');
  const view = adminView(user);
  if (!view) throw notFound('This account has no KYC submission.');
  return view;
}

export function approve(userId, adminId) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');
  assertTransition(user.kyc?.status ?? 'none', 'verified');

  const now = new Date().toISOString();
  const tier = TIER_FOR_ID_TYPE[user.kyc.idType] ?? 'bvn_nin';

  users.update(userId, {
    kyc: { ...user.kyc, status: 'verified', reviewedAt: now, reviewedBy: adminId, rejectionReason: null },
    // Identity verification is worth at least as much as the self-declared
    // tier of the same name — but never a downgrade, in case they had
    // already reached `address` some other way.
    verificationTier: user.verificationTier === 'address' ? 'address' : tier,
  });

  recalculate(userId);
  return selfView(users.get(userId));
}

export function reject(userId, adminId, reason) {
  const user = users.get(userId);
  if (!user) throw notFound('Account not found.');
  assertTransition(user.kyc?.status ?? 'none', 'rejected');

  const cleanReason = String(reason ?? '').trim().slice(0, 500);
  if (cleanReason.length < 5) throw badRequest('Give a reason the applicant can act on.');

  users.update(userId, {
    kyc: {
      ...user.kyc,
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminId,
      rejectionReason: cleanReason,
    },
  });

  return selfView(users.get(userId));
}
