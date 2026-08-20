import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Alert, Pill, Skeleton, EmptyState } from '../components/ui/Primitives';
import { Textarea } from '../components/ui/Form';
import { StatTile, VolumeChart } from '../components/Charts';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatNaira, formatDateTime, timeAgo } from '../lib/format';
import {
  IconWallet, IconShieldCheck, IconScale, IconAlertTriangle, IconRefresh,
  IconUsers, IconCheck, IconX, IconChart, IconIdCard, IconImage,
} from '../components/Icons';

const SEVERITY_TONE = { low: 'neutral', medium: 'warn', high: 'danger', critical: 'danger' };

export default function Admin() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [flags, setFlags] = useState(null);
  const [kycQueue, setKycQueue] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api.admin.overview().then(setOverview).catch((err) => setError(err.message));
    api.admin.flags().then((r) => setFlags(r.flags)).catch(() => {});
    api.admin.kycQueue().then((r) => setKycQueue(r.submissions)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const reviewFlag = async (id, action) => {
    setBusy(id);
    try {
      await api.admin.reviewFlag(id, action);
      load();
      toast.success(action === 'clear' ? 'Flag cleared' : 'Escalated to compliance');
    } catch (err) {
      toast.error('Could not update flag', err.message);
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <>
        <PageHeader title="Operations" />
        <Alert tone="danger" title="Could not load the console">{error}</Alert>
      </>
    );
  }

  const reserve = overview?.reserve;

  return (
    <>
      <PageHeader
        title="Operations console"
        description="Platform health, the Protection Reserve, and everything flagged for a human."
        action={
          <Button variant="secondary" icon={IconRefresh} onClick={load}>
            Refresh
          </Button>
        }
      />

      {/* ---------- totals ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!overview ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-[14px]" />)
        ) : (
          <>
            <StatTile
              label="Held in escrow"
              value={formatNaira(overview.totals.heldKobo, { decimals: false })}
              sublabel="Across all users"
              icon={IconWallet}
              tone="brand"
            />
            <StatTile
              label="Settled all-time"
              value={formatNaira(overview.totals.settledKobo, { decimals: false })}
              sublabel={`${overview.totals.escrows} escrows`}
              icon={IconShieldCheck}
              tone="success"
            />
            <StatTile
              label="Open disputes"
              value={overview.totals.openDisputes}
              sublabel={`${overview.totals.disputeRatePct}% dispute rate`}
              icon={IconScale}
              tone={overview.totals.openDisputes ? 'danger' : 'neutral'}
            />
            <StatTile
              label="Fraud flags"
              value={overview.totals.openFlags}
              sublabel={overview.totals.openFlags ? 'Awaiting review' : 'Nothing outstanding'}
              icon={IconAlertTriangle}
              tone={overview.totals.openFlags ? 'warn' : 'neutral'}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          {/* ---------- volume ---------- */}
          <Card>
            <CardHeader icon={IconChart} title="Settlement volume" description="Value released to sellers each day." />
            {!overview ? <Skeleton className="h-[200px] rounded-[11px]" /> : <VolumeChart series={overview.series} />}
          </Card>

          {/* ---------- fraud flags ---------- */}
          <Card>
            <CardHeader
              icon={IconAlertTriangle}
              title="Fraud & velocity flags"
              description="Raised automatically on escrow creation and funding — before money moves."
            />
            {!flags ? (
              <Skeleton className="h-24 rounded-[11px]" />
            ) : flags.length === 0 ? (
              <EmptyState
                icon={IconShieldCheck}
                title="Nothing flagged"
                description="No accounts are currently showing velocity, fan-out or circular-funding patterns."
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {flags.map((flag) => (
                  <li key={flag.id} className="rounded-[12px] border border-line p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={SEVERITY_TONE[flag.severity]} size="sm">{flag.severity}</Pill>
                      <span className="text-[0.87rem] font-semibold text-ink">{flag.label}</span>
                      <span className="ml-auto text-[0.72rem] text-faint">{timeAgo(flag.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-[0.82rem] text-muted">
                      <span className="font-medium text-ink">{flag.userName}</span> — {flag.detail}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="secondary" icon={IconCheck} loading={busy === flag.id} onClick={() => reviewFlag(flag.id, 'clear')}>
                        Clear
                      </Button>
                      <Button size="sm" variant="ghost" icon={IconX} loading={busy === flag.id} onClick={() => reviewFlag(flag.id, 'escalate')}>
                        Escalate
                      </Button>
                      {flag.escrowId && (
                        <Button size="sm" variant="ghost" to={`/app/escrow/${flag.escrowId}`}>View escrow</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---------- KYC review ---------- */}
          <KycQueueCard submissions={kycQueue} onChanged={load} />

          {/* ---------- ledger ---------- */}
          <Card>
            <CardHeader title="Recent ledger entries" description="Append-only, across the whole platform." />
            {!overview ? (
              <Skeleton className="h-40 rounded-[11px]" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.82rem]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {['Type', 'Note', 'Amount', 'When'].map((h) => (
                        <th key={h} scope="col" className="pb-2 font-semibold text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentLedger.map((entry) => (
                      <tr key={entry.id} className="border-b border-line last:border-0">
                        <td className="py-2.5 pr-3">
                          <span
                            className={cn(
                              'numeric rounded px-1.5 py-0.5 text-[0.68rem] font-bold',
                              entry.type === 'release' && 'bg-success-soft text-success-ink',
                              entry.type === 'fund' && 'bg-brand-soft text-brand-ink',
                              entry.type === 'refund' && 'bg-warn-soft text-warn-ink',
                              !['release', 'fund', 'refund'].includes(entry.type) && 'bg-neutral-soft text-neutral-ink',
                            )}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate py-2.5 pr-3 text-ink">{entry.note}</td>
                        <td className="numeric py-2.5 pr-3 font-semibold text-ink">{formatNaira(entry.amountKobo)}</td>
                        <td className="py-2.5 text-faint">{formatDateTime(entry.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ---------- side ---------- */}
        <div className="flex flex-col gap-6">
          <Card className="brand-gradient border-0 text-white">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-white/60">
              Buyer Protection Reserve
            </p>
            {!reserve ? (
              <Skeleton className="mt-3 h-12 rounded-lg" />
            ) : (
              <>
                <p className="numeric mt-2.5 text-[2rem] font-bold leading-none">
                  {formatNaira(reserve.reserveKobo, { decimals: false })}
                </p>
                <p className="mt-2 text-[0.8rem] text-white/65">
                  {reserve.reserveShareBps / 100}% of every fee flows in here
                </p>

                <dl className="mt-5 flex flex-col gap-2.5 border-t border-white/15 pt-4">
                  {[
                    ['Fees collected', formatNaira(reserve.feesCollectedKobo)],
                    ['Paid out to buyers', formatNaira(reserve.payoutsKobo)],
                    ['Platform fee', `${reserve.feeBps / 100}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[0.8rem] text-white/65">{label}</dt>
                      <dd className="numeric text-[0.85rem] font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>

          <Card>
            <CardHeader icon={IconUsers} title="Platform" />
            <dl className="flex flex-col gap-3">
              {overview && [
                ['Registered users', overview.totals.users],
                ['Total escrows', overview.totals.escrows],
                ['Dispute rate', `${overview.totals.disputeRatePct}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.84rem] text-muted">{label}</dt>
                  <dd className="numeric text-[0.92rem] font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Dispute queue" description="Pre-classified and ready for a decision." />
            <Button to="/app/disputes" fullWidth variant="secondary" icon={IconScale}>
              Open dispute queue
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   KYC review queue
   ========================================================================== */
const ID_TYPE_LABEL = { nin: 'NIN', bvn: 'BVN', passport: 'Passport', drivers_license: "Driver's license" };

function KycQueueCard({ submissions, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');
  const [documents, setDocuments] = useState({}); // userId -> [{docId, dataUrl}]

  const approve = async (userId) => {
    setBusy(userId);
    try {
      await api.admin.kycApprove(userId);
      onChanged();
      toast.success('Identity verified', "The applicant's trust tier has been updated.");
    } catch (err) {
      toast.error('Could not approve', err.message);
    } finally {
      setBusy('');
    }
  };

  const reject = async (userId) => {
    if (reason.trim().length < 5) return;
    setBusy(userId);
    try {
      await api.admin.kycReject(userId, reason.trim());
      setRejectingId(null);
      setReason('');
      onChanged();
      toast.success('Submission rejected', 'The applicant can see the reason and resubmit.');
    } catch (err) {
      toast.error('Could not reject', err.message);
    } finally {
      setBusy('');
    }
  };

  const toggleDocuments = async (submission) => {
    if (documents[submission.userId]) {
      setDocuments((d) => ({ ...d, [submission.userId]: undefined }));
      return;
    }
    try {
      const fetched = await Promise.all(
        submission.documentIds.map((docId) => api.kyc.document(docId).then((r) => r.document)),
      );
      setDocuments((d) => ({ ...d, [submission.userId]: fetched }));
    } catch (err) {
      toast.error('Could not load documents', err.message);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={IconIdCard}
        title="KYC review"
        description="No identity provider is connected — every submission is decided by an administrator. The mock note is advisory only."
      />
      {!submissions ? (
        <Skeleton className="h-24 rounded-[11px]" />
      ) : submissions.length === 0 ? (
        <EmptyState icon={IconShieldCheck} title="Nothing pending" description="No KYC submissions are waiting for review." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {submissions.map((s) => (
            <li key={s.userId} className="rounded-[12px] border border-line p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="warn" size="sm">{ID_TYPE_LABEL[s.idType] ?? s.idType}</Pill>
                <span className="text-[0.87rem] font-semibold text-ink">{s.legalName}</span>
                <span className="text-[0.78rem] text-faint">({s.email})</span>
                <span className="ml-auto text-[0.72rem] text-faint">{timeAgo(s.submittedAt)}</span>
              </div>

              <p className="mt-1.5 text-[0.82rem] text-muted">
                DOB {s.dateOfBirth} · ID number <span className="numeric font-medium text-ink">{s.idNumber}</span>
                {s.submissionCount > 1 && <span> · attempt #{s.submissionCount}</span>}
              </p>

              {s.mockVerification && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[0.78rem] text-muted">
                  <IconAlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
                  <span>
                    <span className="font-semibold text-ink">Mock check:</span> {s.mockVerification.reason}
                  </span>
                </p>
              )}

              {documents[s.userId] && (
                <div className="mt-3 flex gap-2">
                  {documents[s.userId].map((doc) => (
                    <img
                      key={doc.id}
                      src={doc.dataUrl}
                      alt={doc.docType}
                      className="h-20 w-28 rounded-[8px] border border-line object-cover"
                    />
                  ))}
                </div>
              )}

              {rejectingId === s.userId ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Reason the applicant will see, e.g. photo is too blurry to read the ID number."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy === s.userId}
                      disabled={reason.trim().length < 5}
                      onClick={() => reject(s.userId)}
                    >
                      Confirm rejection
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={IconCheck} loading={busy === s.userId} onClick={() => approve(s.userId)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" icon={IconX} onClick={() => setRejectingId(s.userId)}>
                    Reject
                  </Button>
                  <Button size="sm" variant="ghost" icon={IconImage} onClick={() => toggleDocuments(s)}>
                    {documents[s.userId] ? 'Hide documents' : 'View documents'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
