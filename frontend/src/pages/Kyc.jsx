import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, Alert, Pill, Skeleton } from '../components/ui/Primitives';
import { Field, Input, Select } from '../components/ui/Form';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { ACCEPT_ATTRIBUTE, formatBytes, prepareImageUpload } from '../lib/image';
import { formatDate } from '../lib/format';
import {
  IconIdCard, IconCheck, IconCheckCircle, IconAlertTriangle, IconClock, IconCamera,
  IconUpload, IconImage, IconArrowLeft, IconArrowRight, IconLock, IconShieldCheck,
} from '../components/Icons';

const ID_TYPES = [
  { value: 'nin', label: 'National ID (NIN)', hint: '11 digits' },
  { value: 'bvn', label: 'Bank Verification Number (BVN)', hint: '11 digits' },
  { value: 'passport', label: 'International passport', hint: 'e.g. A12345678' },
  { value: 'drivers_license', label: "Driver's license", hint: '6-20 characters' },
];

const ID_PATTERNS = {
  nin: /^\d{11}$/,
  bvn: /^\d{11}$/,
  passport: /^[A-Za-z]\d{8}$/,
  drivers_license: /^[A-Za-z0-9-]{6,20}$/,
};

const STEPS = ['Your details', 'Upload your ID', 'Review & submit'];

const STATUS_META = {
  pending: {
    tone: 'warn',
    icon: IconClock,
    title: 'Under review',
    body: 'An administrator is reviewing your submission. This usually does not take long — check back here for the outcome.',
  },
  verified: {
    tone: 'success',
    icon: IconCheckCircle,
    title: 'Identity verified',
    body: 'Your identity has been verified. This is reflected in your trust profile.',
  },
};

export default function Kyc() {
  const toast = useToast();
  const [kyc, setKyc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      const res = await api.kyc.get();
      setKyc(res.kyc);
    } catch (err) {
      toast.error('Could not load your verification status', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Verify your identity" />
        <Skeleton className="h-[380px] rounded-[14px]" />
      </>
    );
  }

  const status = kyc?.status ?? 'none';
  const editing = showForm || status === 'none';

  return (
    <>
      <PageHeader
        title="Verify your identity"
        description="A verified identity raises your SafeScore and signals to counterparties that you are who you say you are."
      />

      {!editing && status === 'pending' && <StatusCard meta={STATUS_META.pending} kyc={kyc} />}
      {!editing && status === 'verified' && <StatusCard meta={STATUS_META.verified} kyc={kyc} />}
      {!editing && status === 'rejected' && (
        <RejectedCard kyc={kyc} onResubmit={() => setShowForm(true)} />
      )}
      {editing && (
        <KycForm
          initial={status === 'rejected' ? kyc : null}
          onSubmitted={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}
    </>
  );
}

/* ==========================================================================
   Pending / Verified
   ========================================================================== */
function StatusCard({ meta, kyc }) {
  const Icon = meta.icon;
  return (
    <Card>
      <div className="flex flex-col items-center py-6 text-center">
        <span
          className={cn(
            'mb-4 flex h-16 w-16 items-center justify-center rounded-full',
            meta.tone === 'success' ? 'bg-success-soft text-success-ink' : 'bg-warn-soft text-warn-ink',
          )}
        >
          <Icon size={28} />
        </span>
        <h2 className="text-[1.15rem] font-semibold text-ink">{meta.title}</h2>
        <p className="mt-2 max-w-md text-[0.88rem] leading-relaxed text-muted">{meta.body}</p>

        <dl className="mt-6 grid w-full max-w-sm grid-cols-2 gap-4 border-t border-line pt-5 text-left">
          <div>
            <dt className="text-[0.74rem] font-medium text-faint">Submitted</dt>
            <dd className="mt-0.5 text-[0.85rem] font-medium text-ink">{formatDate(kyc.submittedAt)}</dd>
          </div>
          <div>
            <dt className="text-[0.74rem] font-medium text-faint">ID type</dt>
            <dd className="mt-0.5 text-[0.85rem] font-medium text-ink">{ID_TYPES.find((t) => t.value === kyc.idType)?.label ?? kyc.idType}</dd>
          </div>
          <div>
            <dt className="text-[0.74rem] font-medium text-faint">ID number</dt>
            <dd className="numeric mt-0.5 text-[0.85rem] font-medium text-ink">{kyc.idNumberMasked}</dd>
          </div>
          <div>
            <dt className="text-[0.74rem] font-medium text-faint">Status</dt>
            <dd className="mt-0.5"><Pill tone={meta.tone} size="sm">{meta.title}</Pill></dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/* ==========================================================================
   Rejected
   ========================================================================== */
function RejectedCard({ kyc, onResubmit }) {
  return (
    <Card>
      <div className="flex flex-col items-center py-6 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
          <IconAlertTriangle size={28} />
        </span>
        <h2 className="text-[1.15rem] font-semibold text-ink">Submission rejected</h2>
        <p className="mt-2 max-w-md text-[0.88rem] leading-relaxed text-muted">
          Your last submission could not be verified. You can fix the issue below and submit again.
        </p>

        <Alert tone="danger" title="Reason given" className="mt-5 w-full max-w-md text-left">
          {kyc.rejectionReason || 'No reason was given.'}
        </Alert>

        <Button className="mt-6" icon={IconIdCard} onClick={onResubmit}>
          Resubmit your details
        </Button>
      </div>
    </Card>
  );
}

/* ==========================================================================
   Submission form — details -> documents -> review
   ========================================================================== */
function KycForm({ initial, onSubmitted }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    legalName: initial?.legalName ?? '',
    dateOfBirth: initial?.dateOfBirth ?? '',
    idType: initial?.idType ?? 'nin',
    idNumber: '',
  });
  const [idFront, setIdFront] = useState(null);
  const [selfie, setSelfie] = useState(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const validateStep = (i) => {
    const next = {};
    if (i === 0) {
      if (form.legalName.trim().length < 2) next.legalName = 'Enter your full legal name as it appears on your ID.';
      if (!form.dateOfBirth) {
        next.dateOfBirth = 'Enter your date of birth.';
      } else {
        const age = (Date.now() - new Date(form.dateOfBirth).getTime()) / (365.25 * 864e5);
        if (age < 18) next.dateOfBirth = 'You must be at least 18 years old.';
        if (age > 120 || new Date(form.dateOfBirth) > new Date()) next.dateOfBirth = 'Enter a valid date of birth.';
      }
      const idNumber = form.idNumber.trim().toUpperCase();
      if (!ID_PATTERNS[form.idType].test(idNumber)) {
        next.idNumber = `That does not look like a valid ${ID_TYPES.find((t) => t.value === form.idType).label.toLowerCase()}.`;
      }
    }
    if (i === 1 && !idFront) {
      next.idFront = 'Upload a photo of the front of your ID.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    setSubmitting(true);
    setFormError('');
    try {
      const documents = [
        { dataUrl: idFront.dataUrl, fileName: idFront.fileName, type: 'id_front' },
        ...(selfie ? [{ dataUrl: selfie.dataUrl, fileName: selfie.fileName, type: 'selfie' }] : []),
      ];
      await api.kyc.submit({
        legalName: form.legalName.trim(),
        dateOfBirth: form.dateOfBirth,
        idType: form.idType,
        idNumber: form.idNumber.trim().toUpperCase(),
        documents,
      });
      toast.success('Submitted for review', 'We will let you know as soon as it has been reviewed.');
      await onSubmitted();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <Card>
        <ol className="mb-7 flex items-center gap-2" aria-label="Progress">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[0.75rem] font-bold transition-all duration-200',
                    done && 'border-brand bg-brand text-white',
                    active && 'border-brand bg-brand-soft text-brand-ink',
                    !done && !active && 'border-line bg-surface text-faint',
                    i < step && 'cursor-pointer hover:scale-105',
                  )}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${label}`}
                >
                  {done ? <IconCheck size={13} /> : i + 1}
                </button>
                <span className={cn('hidden text-[0.8rem] font-semibold sm:block', active ? 'text-ink' : 'text-faint')}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className={cn('h-0.5 flex-1 rounded', done ? 'bg-brand' : 'bg-line')} />}
              </li>
            );
          })}
        </ol>

        {formError && <Alert tone="danger" title="Could not submit" className="mb-5">{formError}</Alert>}

        {step === 0 && (
          <div className="animate-fade flex flex-col gap-5">
            <div>
              <h2 className="text-[1.15rem] font-semibold text-ink">Your details</h2>
              <p className="mt-1.5 text-[0.88rem] text-muted">
                Enter these exactly as they appear on the ID you will upload next.
              </p>
            </div>

            <Field label="Full legal name" error={errors.legalName} required>
              {(props) => (
                <Input {...props} placeholder="As it appears on your ID" value={form.legalName} onChange={set('legalName')} invalid={Boolean(errors.legalName)} />
              )}
            </Field>

            <Field label="Date of birth" error={errors.dateOfBirth} required>
              {(props) => (
                <Input {...props} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} invalid={Boolean(errors.dateOfBirth)} />
              )}
            </Field>

            <Field label="ID type" required>
              {(props) => (
                <Select {...props} value={form.idType} onChange={set('idType')}>
                  {ID_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label={`${ID_TYPES.find((t) => t.value === form.idType).label} number`}
              hint={ID_TYPES.find((t) => t.value === form.idType).hint}
              error={errors.idNumber}
              required
            >
              {(props) => (
                <Input {...props} placeholder="Enter the number" value={form.idNumber} onChange={set('idNumber')} invalid={Boolean(errors.idNumber)} />
              )}
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade flex flex-col gap-5">
            <div>
              <h2 className="text-[1.15rem] font-semibold text-ink">Upload your ID</h2>
              <p className="mt-1.5 text-[0.88rem] text-muted">
                A clear photo of the front is required. A selfie is optional but speeds up review.
              </p>
            </div>

            <DocumentPicker
              label="Front of your ID"
              hint="All four corners visible, no glare, text legible."
              value={idFront}
              onChange={setIdFront}
              error={errors.idFront}
              required
            />

            <DocumentPicker
              label="Selfie (optional)"
              hint="A clear photo of your face, for the reviewer to compare against your ID."
              value={selfie}
              onChange={setSelfie}
            />
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade flex flex-col gap-5">
            <div>
              <h2 className="text-[1.15rem] font-semibold text-ink">Review &amp; submit</h2>
              <p className="mt-1.5 text-[0.88rem] text-muted">
                Check everything below. Once submitted, you cannot edit it until it has been reviewed.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-[13px] border border-line bg-sunken p-4">
              <div>
                <dt className="text-[0.74rem] font-medium text-faint">Legal name</dt>
                <dd className="mt-0.5 text-[0.88rem] font-medium text-ink">{form.legalName}</dd>
              </div>
              <div>
                <dt className="text-[0.74rem] font-medium text-faint">Date of birth</dt>
                <dd className="mt-0.5 text-[0.88rem] font-medium text-ink">{formatDate(form.dateOfBirth)}</dd>
              </div>
              <div>
                <dt className="text-[0.74rem] font-medium text-faint">ID type</dt>
                <dd className="mt-0.5 text-[0.88rem] font-medium text-ink">{ID_TYPES.find((t) => t.value === form.idType).label}</dd>
              </div>
              <div>
                <dt className="text-[0.74rem] font-medium text-faint">ID number</dt>
                <dd className="numeric mt-0.5 text-[0.88rem] font-medium text-ink">{form.idNumber.toUpperCase()}</dd>
              </div>
            </dl>

            <div className="flex gap-3">
              <img src={idFront?.dataUrl} alt="Front of your ID" className="h-24 w-32 rounded-[10px] border border-line object-cover" />
              {selfie && <img src={selfie.dataUrl} alt="Your selfie" className="h-24 w-32 rounded-[10px] border border-line object-cover" />}
            </div>

            <Alert tone="brand">
              <IconLock size={13} className="mr-1 inline align-[-2px]" />
              Your documents are only visible to you and to SafePay administrators reviewing this submission.
            </Alert>
          </div>
        )}

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
          <Button variant="ghost" icon={IconArrowLeft} onClick={() => setStep((s) => s - 1)} disabled={submitting || step === 0}>
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={goNext} iconRight={IconArrowRight}>Continue</Button>
          ) : (
            <Button onClick={submit} loading={submitting} icon={IconShieldCheck}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          )}
        </div>
      </Card>

      <Card className="lg:sticky lg:top-6">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-faint">Why verify?</p>
        <ul className="mt-4 flex flex-col gap-3.5">
          {[
            'Raises your SafeScore by up to 12 points',
            'Shown to counterparties as a trust signal',
            'Documents are reviewed by SafePay, never shared',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[0.85rem] text-ink">
              <IconCheck size={15} className="mt-0.5 shrink-0 text-success" />
              {line}
            </li>
          ))}
        </ul>

        <Alert tone="neutral" className="mt-5">
          SafePay does not verify submissions against any government database for this build — every
          submission is checked by a human administrator.
        </Alert>
      </Card>
    </div>
  );
}

/* ==========================================================================
   One document upload slot
   ========================================================================== */
function DocumentPicker({ label, hint, value, onChange, error, required }) {
  const [reading, setReading] = useState(false);
  const [pickError, setPickError] = useState('');
  const inputRef = useRef(null);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setReading(true);
    setPickError('');
    try {
      onChange(await prepareImageUpload(file));
    } catch (err) {
      onChange(null);
      setPickError(err.message);
    } finally {
      setReading(false);
    }
  };

  return (
    <Field label={label} hint={hint} error={pickError || error} required={required}>
      {() => (
        <>
          <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} capture="environment" onChange={pick} className="sr-only" />

          {value ? (
            <div className="overflow-hidden rounded-[12px] border border-line">
              <img src={value.dataUrl} alt={label} className="max-h-56 w-full bg-sunken object-contain" />
              <div className="flex items-center gap-3 border-t border-line bg-raised px-3 py-2.5">
                <IconImage size={16} className="shrink-0 text-muted" />
                <p className="min-w-0 flex-1 truncate text-[0.78rem] text-muted">
                  {value.width}×{value.height} · {formatBytes(value.byteSize)}
                </p>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="shrink-0 rounded-[8px] px-2 py-1 text-[0.76rem] font-semibold text-muted transition-colors hover:bg-sunken hover:text-danger-ink"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={reading}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-4 py-8 transition-colors disabled:opacity-60',
                error ? 'border-danger bg-danger-soft/30' : 'border-line-strong bg-sunken hover:border-brand/50 hover:bg-brand-soft/30',
              )}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                {reading ? <IconUpload size={20} /> : <IconCamera size={20} />}
              </span>
              <span className="text-[0.88rem] font-semibold text-ink">
                {reading ? 'Preparing photo…' : 'Take or choose a photo'}
              </span>
              <span className="text-[0.76rem] text-muted">Resized in your browser before it is sent</span>
            </button>
          )}
        </>
      )}
    </Field>
  );
}
