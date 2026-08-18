import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Alert, Pill, Skeleton, Modal, CopyField, Avatar } from '../components/ui/Primitives';
import { Field, Textarea } from '../components/ui/Form';
import { StatusStepper, MilestoneList } from '../components/Escrow';
import { TrustChip } from '../components/Trust';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import {
  formatNaira, formatDateTime, timeAgo, ESCROW_TYPE_LABELS, STATUS_META,
} from '../lib/format';
import {
  IconArrowLeft, IconWallet, IconShieldCheck, IconScale, IconClock, IconCheck,
  IconQr, IconLock, IconX,
} from '../components/Icons';

export default function EscrowDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [milestoneBusy, setMilestoneBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);   // 'release' | 'fund' | 'cancel'
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [disputeError, setDisputeError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.escrows.get(id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const escrow = data?.escrow;
  const ledger = data?.ledger ?? [];
  const isBuyer = escrow?.buyer?.id === user?.id;
  const counterparty = isBuyer ? escrow?.seller : escrow?.buyer;
  const meta = escrow ? STATUS_META[escrow.status] : null;

  const run = async (label, fn, successTitle, successBody) => {
    setBusy(label);
    try {
      const res = await fn();
      setData((d) => ({ ...d, escrow: res.escrow }));
      await load();
      toast.success(successTitle, successBody);
    } catch (err) {
      toast.error('That did not work', err.message);
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  const approveMilestone = async (milestoneId) => {
    setMilestoneBusy(milestoneId);
    try {
      await api.escrows.approveMilestone(id, milestoneId);
      await load();
      toast.success('Milestone released', 'That portion has been paid to the seller.');
    } catch (err) {
      toast.error('Could not release milestone', err.message);
    } finally {
      setMilestoneBusy(null);
    }
  };

  const submitDispute = async () => {
    if (disputeText.trim().length < 12) {
      setDisputeError('Tell us what went wrong — at least a sentence, so we can resolve it faster.');
      return;
    }
    setBusy('dispute');
    try {
      await api.disputes.create({ escrowId: id, reason: disputeText.trim() });
      await load();
      setDisputeOpen(false);
      setDisputeText('');
      toast.success('Dispute raised', 'The funds are frozen while our team reviews it.');
    } catch (err) {
      setDisputeError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <>
        <PageHeader title="Escrow" />
        <Alert tone="danger" title="Could not load this escrow">{error}</Alert>
        <Button to="/app/escrows" variant="secondary" icon={IconArrowLeft} className="mt-5">
          Back to escrows
        </Button>
      </>
    );
  }

  if (!escrow) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-6 h-[220px] rounded-[14px]" />
        <Skeleton className="mt-4 h-[340px] rounded-[14px]" />
      </>
    );
  }

  const canFund = isBuyer && escrow.status === 'created';
  const canDeliver = !isBuyer && escrow.status === 'funded';
  const canRelease = isBuyer && ['funded', 'in_progress'].includes(escrow.status);
  const canDispute = ['funded', 'in_progress'].includes(escrow.status);
  const canCancel = escrow.status === 'created';

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link
            to="/app/escrows"
            className="inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-muted transition-colors hover:text-ink"
          >
            <IconArrowLeft size={14} />
            All escrows
          </Link>
        }
        title={escrow.title}
        description={escrow.description || undefined}
        action={<Pill tone={meta.tone}>{meta.label}</Pill>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          {/* ---------- money + status ---------- */}
          <Card>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[0.78rem] font-medium text-muted">
                  {escrow.status === 'released' ? 'Released to seller' : 'Amount in escrow'}
                </p>
                <p className="numeric mt-1.5 text-[2.1rem] font-bold leading-none text-ink">
                  {formatNaira(escrow.amountKobo)}
                </p>
                <p className="mt-2 text-[0.79rem] text-muted">
                  Fee <span className="numeric">{formatNaira(escrow.feeKobo)}</span>
                  {' · '}
                  seller receives <span className="numeric">{formatNaira(escrow.netToSellerKobo)}</span>
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Pill tone="neutral" size="sm" dot={false}>{ESCROW_TYPE_LABELS[escrow.type]}</Pill>
                {escrow.autoReleaseAt && ['funded', 'in_progress'].includes(escrow.status) && (
                  <span className="inline-flex items-center gap-1.5 text-[0.76rem] text-muted">
                    <IconClock size={13} />
                    Auto-releases {timeAgo(escrow.autoReleaseAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-7 border-t border-line pt-6">
              <StatusStepper status={escrow.status} />
            </div>

            <p className="mt-5 rounded-[11px] bg-sunken px-3.5 py-2.5 text-[0.83rem] text-muted">
              <IconLock size={13} className="mr-1.5 inline align-[-2px] text-brand" />
              {meta.hint}
            </p>

            {/* ---------- actions ---------- */}
            {(canFund || canDeliver || canRelease || canDispute || canCancel) && (
              <div className="mt-6 flex flex-wrap gap-2.5 border-t border-line pt-5">
                {canFund && (
                  <Button icon={IconWallet} onClick={() => setConfirm('fund')} loading={busy === 'fund'}>
                    Fund this escrow
                  </Button>
                )}
                {canDeliver && (
                  <Button
                    icon={IconCheck}
                    onClick={() => run('deliver', () => api.escrows.deliver(id), 'Marked as delivered', 'The buyer has been asked to confirm.')}
                    loading={busy === 'deliver'}
                  >
                    Mark as delivered
                  </Button>
                )}
                {canRelease && (
                  <Button
                    variant="success"
                    icon={IconShieldCheck}
                    onClick={() => setConfirm('release')}
                    loading={busy === 'release'}
                  >
                    Confirm &amp; release funds
                  </Button>
                )}
                {canDispute && (
                  <Button variant="secondary" icon={IconScale} onClick={() => setDisputeOpen(true)}>
                    Raise a dispute
                  </Button>
                )}
                {canCancel && (
                  <Button variant="ghost" icon={IconX} onClick={() => setConfirm('cancel')} loading={busy === 'cancel'}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* ---------- milestones ---------- */}
          {escrow.milestones?.length > 0 && (
            <Card>
              <CardHeader
                title="Milestones"
                description="Each stage is released on its own, so neither side carries the whole risk."
              />
              <MilestoneList
                milestones={escrow.milestones}
                canApprove={isBuyer && ['funded', 'in_progress'].includes(escrow.status)}
                onApprove={approveMilestone}
                busyId={milestoneBusy}
              />
            </Card>
          )}

          {/* ---------- ledger ---------- */}
          <Card>
            <CardHeader
              title="Money trail"
              description="Append-only. Entries are never edited or deleted — a correction is a new entry."
            />
            {ledger.length === 0 ? (
              <p className="rounded-[11px] border border-dashed border-line px-4 py-8 text-center text-[0.85rem] text-faint">
                Nothing has moved yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {ledger.map((entry, i) => (
                  <li
                    key={entry.id}
                    className={cn('flex items-center gap-3 py-3', i > 0 && 'border-t border-line')}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        entry.type === 'fund' && 'bg-brand-soft text-brand-ink',
                        entry.type === 'release' && 'bg-success-soft text-success-ink',
                        entry.type === 'refund' && 'bg-warn-soft text-warn-ink',
                        (entry.type === 'fee' || entry.type === 'reserve') && 'bg-neutral-soft text-neutral-ink',
                      )}
                    >
                      {entry.type === 'release' ? <IconShieldCheck size={15} /> : <IconWallet size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.86rem] font-medium text-ink">{entry.note}</p>
                      <p className="text-[0.74rem] text-faint">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <span className="numeric shrink-0 text-[0.86rem] font-semibold text-ink">
                      {formatNaira(entry.amountKobo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---------- side ---------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={isBuyer ? 'You are buying from' : 'You are selling to'} />
            {counterparty ? (
              <div className="flex items-center gap-3">
                <Avatar name={counterparty.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.94rem] font-semibold text-ink">{counterparty.name}</p>
                  {counterparty.invited ? (
                    <p className="text-[0.78rem] text-muted">Invited — not on SafePay yet</p>
                  ) : (
                    <Link
                      to={`/trust/${counterparty.id}`}
                      className="text-[0.78rem] text-brand-ink hover:underline"
                    >
                      View trust profile
                    </Link>
                  )}
                </div>
                {!counterparty.invited && (
                  <TrustChip score={counterparty.safeScore} tier={counterparty.scoreTier} />
                )}
              </div>
            ) : (
              <p className="text-[0.85rem] text-muted">Waiting for the other party to join.</p>
            )}
          </Card>

          {/* in-person QR */}
          {escrow.claimCode && escrow.status === 'created' && (
            <Card>
              <CardHeader
                icon={IconQr}
                title="In-person handoff"
                description="Show this to the other person. They scan it or type the code to join."
              />
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-[14px] border border-line bg-white p-4">
                  <QRCodeSVG
                    value={`${window.location.origin}/app/claim?code=${escrow.claimCode}`}
                    size={168}
                    level="M"
                    fgColor="#3B1439"
                    bgColor="#FFFFFF"
                  />
                </div>
                <CopyField value={escrow.claimCode} label="Or share this code" className="w-full" />
              </div>
            </Card>
          )}

          {/* timeline */}
          <Card>
            <CardHeader title="History" />
            <ol className="relative flex flex-col gap-4 pl-6">
              <span className="absolute left-[7px] top-2 bottom-2 w-px bg-line" aria-hidden="true" />
              {[...escrow.timeline].reverse().map((entry, i) => (
                <li key={`${entry.event}-${entry.at}-${i}`} className="relative">
                  <span
                    className={cn(
                      'absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-surface',
                      i === 0 ? 'bg-brand' : 'bg-line-strong',
                    )}
                    aria-hidden="true"
                  />
                  <p className="text-[0.85rem] font-medium capitalize text-ink">
                    {entry.event.replace(/_/g, ' ').replace(/:/g, ': ')}
                  </p>
                  <p className="text-[0.74rem] text-faint">{formatDateTime(entry.at)}</p>
                  {entry.note && <p className="mt-0.5 text-[0.78rem] text-muted">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {/* ---------- confirmations ---------- */}
      <Modal
        open={confirm === 'fund'}
        onClose={() => setConfirm(null)}
        title="Fund this escrow?"
        description={`${formatNaira(escrow.amountKobo)} will leave your account and be held by SafePay. The seller cannot touch it until you confirm delivery.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              data-autofocus
              icon={IconWallet}
              loading={busy === 'fund'}
              onClick={() => run('fund', () => api.escrows.fund(id), 'Escrow funded', 'The seller can now deliver with confidence.')}
            >
              Fund {formatNaira(escrow.amountKobo)}
            </Button>
          </>
        }
      >
        <Alert tone="brand" title="Your money stays protected">
          If the seller does not deliver, raise a dispute and SafePay will not release the funds.
        </Alert>
      </Modal>

      <Modal
        open={confirm === 'release'}
        onClose={() => setConfirm(null)}
        title="Release the funds?"
        description="This pays the seller immediately and cannot be undone. Only do this once you have received what you paid for."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Not yet</Button>
            <Button
              data-autofocus
              variant="success"
              icon={IconShieldCheck}
              loading={busy === 'release'}
              onClick={() => run('release', () => api.escrows.release(id), 'Funds released', 'The seller has been paid.')}
            >
              Yes, release {formatNaira(escrow.netToSellerKobo)}
            </Button>
          </>
        }
      >
        <Alert tone="warn" title="This is irreversible">
          Once released, SafePay can no longer hold or refund this money.
        </Alert>
      </Modal>

      <Modal
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        title="Cancel this escrow?"
        description="Nothing has been funded, so no money is affected. The escrow will be closed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Keep it</Button>
            <Button
              data-autofocus
              variant="danger"
              loading={busy === 'cancel'}
              onClick={() => run('cancel', () => api.escrows.cancel(id), 'Escrow cancelled')}
            >
              Cancel escrow
            </Button>
          </>
        }
      >
        <p className="text-[0.88rem] text-muted">You can always create a new one.</p>
      </Modal>

      {/* ---------- dispute ---------- */}
      <Modal
        open={disputeOpen}
        onClose={() => { setDisputeOpen(false); setDisputeError(''); }}
        title="Raise a dispute"
        description="The funds freeze immediately. Our team reads every dispute — the more specific you are, the faster it resolves."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button variant="danger" icon={IconScale} loading={busy === 'dispute'} onClick={submitDispute}>
              Raise dispute
            </Button>
          </>
        }
      >
        <Field
          label="What went wrong?"
          hint="Include dates, what was promised, and what actually happened."
          error={disputeError}
          required
        >
          {(props) => (
            <Textarea
              {...props}
              data-autofocus
              rows={5}
              placeholder="I paid on 3 August for a Canon EOS 200D described as under 8,000 shutter count. The one delivered has over 40,000 and a scratched sensor."
              value={disputeText}
              onChange={(e) => { setDisputeText(e.target.value); setDisputeError(''); }}
              invalid={Boolean(disputeError)}
            />
          )}
        </Field>
        <Alert tone="warn" title="Automatically triaged" className="mt-4">
          SafePay classifies your dispute the moment you submit it, so it reaches the right
          reviewer without waiting in a queue.
        </Alert>
      </Modal>
    </>
  );
}
