import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Alert, Pill, Skeleton, Modal, CopyField, Avatar } from '../components/ui/Primitives';
import { Field, Textarea } from '../components/ui/Form';
import { StatusStepper, MilestoneList } from '../components/Escrow';
import { TrustChip } from '../components/Trust';
import { TransactionRiskCard } from '../components/Intelligence';
import { AddMoneyFlow } from '../components/Funding';
import { SuccessLottie } from '../components/SuccessLottie';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { ACCEPT_ATTRIBUTE, formatBytes, prepareImageUpload } from '../lib/image';
import {
  formatNaira, formatDateTime, ESCROW_TYPE_LABELS, STATUS_META,
} from '../lib/format';
import {
  IconArrowLeft, IconWallet, IconShieldCheck, IconScale, IconCheck, IconCamera,
  IconImage, IconUpload, IconQr, IconLock, IconX, IconPlus,
} from '../components/Icons';

export default function EscrowDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [risk, setRisk] = useState(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState('');
  const [milestoneBusy, setMilestoneBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);   // 'release' | 'fund' | 'cancel'
  const [funded, setFunded] = useState(false);    // keeps the fund dialog open on its confirmation
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [balanceKobo, setBalanceKobo] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.escrows.get(id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  /* The balance decides what the funding dialog can even offer, so it is read
     alongside the escrow rather than when the dialog opens — by then the user
     is already looking at a button that may not work. */
  const loadBalance = useCallback(async () => {
    try {
      const wallet = await api.wallet.get();
      setBalanceKobo(wallet.balanceKobo);
    } catch {
      // Not fatal: the funding dialog falls back to asking the API and
      // reporting whatever it says.
      setBalanceKobo(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBalance(); }, [loadBalance]);

  useEffect(() => {
    let cancelled = false;
    setRiskLoading(true);
    setRiskError('');
    api.intelligence.risk(id)
      .then((res) => { if (!cancelled) setRisk(res.risk); })
      .catch((err) => { if (!cancelled) setRiskError(err.message); })
      .finally(() => { if (!cancelled) setRiskLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const escrow = data?.escrow;
  const ledger = data?.ledger ?? [];
  const isBuyer = escrow?.buyer?.id === user?.id;
  const isSeller = escrow?.seller?.id === user?.id;
  const counterparty = isBuyer ? escrow?.seller : escrow?.buyer;
  const meta = escrow ? STATUS_META[escrow.status] : null;

  const run = async (label, fn, successTitle, successBody) => {
    setBusy(label);
    try {
      const res = await fn();
      setData((d) => ({ ...d, escrow: res.escrow }));
      await load();
      await loadBalance();
      toast.success(successTitle, successBody);
    } catch (err) {
      toast.error('That did not work', err.message);
      throw err;
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  /* Swallowed at the call site: `run` rethrows so callers that need to stay
     open on failure can, and the plain buttons deliberately do not. */
  const fire = (...args) => { run(...args).catch(() => {}); };

  /* Funding deliberately does not go through `run`, whose success path is
     "close the dialog and toast". This is the moment the buyer came here for —
     their money arriving somewhere safe — so the dialog stays open and shows
     it, and the confirmation replaces the toast rather than doubling it. */
  const fundEscrow = async () => {
    setBusy('fund');
    try {
      const res = await api.escrows.fund(id);
      setData((d) => ({ ...d, escrow: res.escrow }));
      await load();
      await loadBalance();
      setFunded(true);
    } catch (err) {
      toast.error('That did not work', err.message);
    } finally {
      setBusy('');
    }
  };

  const approveMilestone = async (milestoneId) => {
    setMilestoneBusy(milestoneId);
    try {
      await api.escrows.approveMilestone(id, milestoneId);
      await load();
      await loadBalance();
      toast.success('Milestone released', 'That portion has been paid to the seller, less the SafePay fee.');
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
                {/* Both numbers, always. The buyer pays the top figure and the
                    seller banks the bottom one; showing only the headline is
                    how a fee ends up feeling like a surprise. */}
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-[0.78rem] text-muted">SafePay fee</dt>
                    <dd className="numeric text-[0.82rem] font-semibold text-ink">−{formatNaira(escrow.feeKobo)}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-[0.78rem] text-muted">Seller receives</dt>
                    <dd className="numeric text-[0.82rem] font-semibold text-ink">{formatNaira(escrow.netToSellerKobo)}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Pill tone="neutral" size="sm" dot={false}>{ESCROW_TYPE_LABELS[escrow.type]}</Pill>
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
                  <Button icon={IconCamera} onClick={() => setDeliverOpen(true)} loading={busy === 'deliver'}>
                    Confirm delivery
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
                {isSeller && escrow.status === 'in_progress' && (
                  <Button variant="secondary" icon={IconCamera} onClick={() => setDeliverOpen(true)}>
                    {escrow.deliveryProof ? 'Replace delivery proof' : 'Add delivery proof'}
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

          {/* ---------- delivery proof ---------- */}
          {escrow.deliveryProof && <DeliveryProofCard escrowId={id} proof={escrow.deliveryProof} isSeller={isSeller} />}

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

          <TransactionRiskCard risk={risk} loading={riskLoading} error={riskError} />

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
      {/* Rendered conditionally rather than kept mounted and hidden: a fresh
          mount is what resets these forms, with no effect chasing `open`. */}
      {confirm === 'fund' && (
        <FundModal
          onClose={() => { setConfirm(null); setFunded(false); loadBalance(); }}
          escrow={escrow}
          balanceKobo={balanceKobo}
          busy={busy === 'fund'}
          funded={funded}
          onTopUp={loadBalance}
          onFund={fundEscrow}
        />
      )}

      {/* ---------- delivery ---------- */}
      {deliverOpen && (
        <DeliverModal
          onClose={() => setDeliverOpen(false)}
          alreadyDelivered={escrow.status === 'in_progress'}
          onSubmit={async ({ note, proof }) => {
            await run('deliver', () => api.escrows.deliver(id, { note, proof }),
              'Delivery confirmed', 'The buyer has been asked to confirm, and your proof is on file.');
            setDeliverOpen(false);
          }}
        />
      )}

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
              onClick={() => fire('release', () => api.escrows.release(id), 'Funds released', 'The seller has been paid.')}
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
              onClick={() => fire('cancel', () => api.escrows.cancel(id), 'Escrow cancelled')}
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

/* ==========================================================================
   Funding
   ========================================================================== */

/**
 * Funding an escrow, in whichever of the two states the buyer is actually in.
 *
 * They either have the money in SafePay or they do not, and the dialog says so
 * before they press anything. If they are short, the top-up flow is right here
 * with the shortfall already filled in — bouncing someone to a wallet screen to
 * work out their own arithmetic is how a checkout loses people.
 */
function FundModal({ onClose, escrow, balanceKobo, busy, funded, onFund, onTopUp }) {
  const known = typeof balanceKobo === 'number';
  const short = known && balanceKobo < escrow.amountKobo;
  const shortfall = short ? escrow.amountKobo - balanceKobo : 0;
  const [topUp, setTopUp] = useState(false);

  const showingTopUp = topUp || (short && !known);

  /* Funded. The animation is the answer to "did that work?", so it leads and
     the numbers follow it, rather than the other way round. */
  if (funded) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Escrow funded"
        footer={<Button data-autofocus icon={IconCheck} onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col items-center text-center">
          <SuccessLottie variant="funded" label={`${formatNaira(escrow.amountKobo)} paid into escrow`} />
          <p className="numeric text-[1.5rem] font-bold leading-none text-ink">
            {formatNaira(escrow.amountKobo)}
          </p>
          <p className="mt-2.5 text-[0.88rem] leading-relaxed text-muted">
            is held by SafePay until you confirm delivery. The seller can send your order now,
            knowing the money is already there.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={showingTopUp ? 'Add money first' : 'Fund this escrow?'}
      description={
        showingTopUp
          ? `You need ${formatNaira(shortfall)} more to cover this escrow.`
          : `${formatNaira(escrow.amountKobo)} moves out of your SafePay balance and is held. The seller cannot touch it until you confirm delivery.`
      }
      footer={!showingTopUp && (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {short ? (
            <Button data-autofocus icon={IconPlus} onClick={() => setTopUp(true)}>
              Add {formatNaira(shortfall)}
            </Button>
          ) : (
            <Button data-autofocus icon={IconWallet} loading={busy} onClick={onFund}>
              Fund {formatNaira(escrow.amountKobo)}
            </Button>
          )}
        </>
      )}
    >
      {showingTopUp ? (
        <AddMoneyFlow
          initialKobo={shortfall}
          submitLabel="Show me the account number"
          onFunded={() => { onTopUp?.(); setTopUp(false); }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-sunken px-3.5 py-3">
            <span className="text-[0.83rem] text-muted">Your SafePay balance</span>
            <span className={cn('numeric text-[0.95rem] font-semibold', short ? 'text-danger-ink' : 'text-ink')}>
              {known ? formatNaira(balanceKobo) : '—'}
            </span>
          </div>

          {short ? (
            <Alert tone="warn" title={`${formatNaira(shortfall)} short`}>
              Add money to your SafePay balance and this escrow funds straight after.
            </Alert>
          ) : (
            <Alert tone="brand" title="Your money stays protected">
              If the seller does not deliver, raise a dispute and SafePay will not release the funds.
            </Alert>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ==========================================================================
   Delivery, with proof
   ========================================================================== */

/**
 * The seller's side of "I have handed this over".
 *
 * The photo is optional but pushed hard, and the reason is stated rather than
 * implied: a buyer who never confirms is the case escrow handles worst, and a
 * timestamped picture of the handover is the only thing that lets anyone decide
 * such a dispute on evidence instead of on who sounds more convincing.
 */
function DeliverModal({ onClose, onSubmit, alreadyDelivered }) {
  const [note, setNote] = useState('');
  const [proof, setProof] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef(null);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    /* Cleared immediately so choosing the same file twice still fires a
       change event — otherwise a retry after an error does nothing. */
    event.target.value = '';
    if (!file) return;

    setReading(true);
    setError('');
    try {
      setProof(await prepareImageUpload(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit({ note: note.trim() || null, proof: proof ? { dataUrl: proof.dataUrl, fileName: proof.fileName } : null });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={alreadyDelivered ? 'Add proof of delivery' : 'Confirm you have delivered'}
      description="The buyer sees this immediately, and so does whoever reviews a dispute."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button data-autofocus icon={IconCheck} loading={busy} disabled={reading} onClick={submit}>
            {alreadyDelivered ? 'Save proof' : 'Confirm delivery'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger" title="That did not work">{error}</Alert>}

        <Field
          label="Proof of delivery"
          hint="A photo of the item handed over, the parcel with its waybill, or the finished work."
        >
          {() => (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                capture="environment"
                onChange={pick}
                className="sr-only"
              />

              {proof ? (
                <div className="overflow-hidden rounded-[12px] border border-line">
                  <img
                    src={proof.dataUrl}
                    alt="Your proof of delivery"
                    className="max-h-64 w-full bg-sunken object-contain"
                  />
                  <div className="flex items-center gap-3 border-t border-line bg-raised px-3 py-2.5">
                    <IconImage size={16} className="shrink-0 text-muted" />
                    <p className="min-w-0 flex-1 truncate text-[0.78rem] text-muted">
                      {proof.width}×{proof.height} · {formatBytes(proof.byteSize)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setProof(null)}
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
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-line-strong bg-sunken px-4 py-8 transition-colors hover:border-brand/50 hover:bg-brand-soft/30 disabled:opacity-60"
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

        <Field label="Anything the buyer should know?" hint="Optional. A tracking number, where you left it, who signed.">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              placeholder="Handed to the buyer at Ikeja City Mall, 4:15pm. They checked the battery health before we parted."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>

        {!proof && (
          <Alert tone="warn" title="Delivering without a photo?">
            You can, but if the buyer goes quiet there is nothing to weigh against their account of
            it. A picture is what turns a disagreement into a decidable one.
          </Alert>
        )}
      </div>
    </Modal>
  );
}

/* ==========================================================================
   Delivery proof, once it exists
   ========================================================================== */

/**
 * The photo is fetched on demand rather than riding along inside the escrow:
 * it is the largest thing in this record by an order of magnitude, and most
 * views of an escrow never need it.
 */
function DeliveryProofCard({ escrowId, proof, isSeller }) {
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setError('');
    api.escrows
      .proof(escrowId)
      .then((res) => { if (!cancelled) setImage(res.proof); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [escrowId, proof?.id]);

  return (
    <>
      <Card>
        <CardHeader
          icon={IconCamera}
          title="Proof of delivery"
          description={
            isSeller
              ? 'What you uploaded when you confirmed delivery. The buyer can see this too.'
              : 'Uploaded by the seller when they marked this delivered.'
          }
        />

        {error ? (
          <Alert tone="warn" title="Could not load the photo">{error}</Alert>
        ) : !image ? (
          <Skeleton className="h-56 rounded-[12px]" />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full overflow-hidden rounded-[12px] border border-line transition-colors hover:border-brand/45"
          >
            <img
              src={image.dataUrl}
              alt="Proof of delivery uploaded by the seller"
              className="max-h-80 w-full bg-sunken object-contain"
            />
          </button>
        )}

        <p className="mt-3 text-[0.76rem] text-faint">
          Uploaded {formatDateTime(proof.uploadedAt)}
          {proof.byteSize ? ` · ${formatBytes(proof.byteSize)}` : ''}
        </p>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Proof of delivery" size="lg">
        {image && (
          <img
            src={image.dataUrl}
            alt="Proof of delivery uploaded by the seller"
            className="max-h-[70vh] w-full rounded-[12px] bg-sunken object-contain"
          />
        )}
      </Modal>
    </>
  );
}
