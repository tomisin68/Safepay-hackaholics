import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, EmptyState, Skeleton, Tabs, Pill, Alert, Modal, Avatar } from '../components/ui/Primitives';
import { Field, Textarea } from '../components/ui/Form';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { formatNaira, timeAgo } from '../lib/format';
import {
  IconScale, IconSpark, IconShieldCheck, IconWallet, IconArrowRight, IconCheck,
} from '../components/Icons';

const SEVERITY_TONE = { low: 'neutral', medium: 'warn', high: 'danger', critical: 'danger' };
const STATUS_TONE = { open: 'warn', under_review: 'brand', resolved: 'success' };
const STATUS_LABEL = { open: 'Open', under_review: 'Under review', resolved: 'Resolved' };

export default function Disputes() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api.disputes.list().then(setData).catch((err) => setError(err.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const disputes = useMemo(() => data?.disputes ?? [], [data]);

  const tabs = useMemo(() => ([
    { value: 'all', label: 'All', count: disputes.length },
    { value: 'open', label: 'Open', count: disputes.filter((d) => d.status === 'open').length },
    { value: 'under_review', label: 'Reviewing', count: disputes.filter((d) => d.status === 'under_review').length },
    { value: 'resolved', label: 'Resolved', count: disputes.filter((d) => d.status === 'resolved').length },
  ]), [disputes]);

  const visible = tab === 'all' ? disputes : disputes.filter((d) => d.status === tab);

  const resolve = async (outcome) => {
    setBusy(outcome);
    try {
      await api.disputes.resolve(resolving.id, { outcome, note: note.trim() });
      setResolving(null);
      setNote('');
      load();
      toast.success(
        'Dispute resolved',
        outcome === 'refund_buyer' ? 'The buyer has been refunded.' : 'The funds were released to the seller.',
      );
    } catch (err) {
      toast.error('Could not resolve', err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader
        title="Disputes"
        description={
          isAdmin
            ? 'Every dispute is classified on arrival, so the queue arrives pre-sorted.'
            : 'Disputes you have raised, or that were raised against you.'
        }
      />

      {error && <Alert tone="danger" title="Could not load disputes" className="mb-6">{error}</Alert>}

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5 sm:max-w-fit" />

      {!data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[168px] rounded-[14px]" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={IconShieldCheck}
            title="No disputes here"
            description="Escrows only get disputed when something goes wrong — a quiet list is a good list."
            action={<Button to="/app/escrows" variant="secondary" iconRight={IconArrowRight}>View escrows</Button>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((dispute) => (
            <Card key={dispute.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-danger-soft text-danger-ink">
                    <IconScale size={19} />
                  </span>
                  <div className="min-w-0">
                    <Link
                      to={`/app/escrow/${dispute.escrowId}`}
                      className="text-[1rem] font-semibold text-ink transition-colors hover:text-brand-ink"
                    >
                      {dispute.escrow?.title ?? 'Escrow'}
                    </Link>
                    <p className="mt-0.5 text-[0.78rem] text-muted">
                      Raised by {dispute.raisedByName} · {timeAgo(dispute.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="numeric text-[0.92rem] font-semibold text-ink">
                    {formatNaira(dispute.escrow?.amountKobo ?? 0)}
                  </span>
                  <Pill tone={STATUS_TONE[dispute.status]}>{STATUS_LABEL[dispute.status]}</Pill>
                </div>
              </div>

              {/* AI triage */}
              {dispute.ai && (
                <div className="mt-4 rounded-[12px] border border-brand-line bg-brand-soft p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-brand-ink">
                      <IconSpark size={13} />
                      Auto-triage
                    </span>
                    <Pill tone="brand" size="sm" dot={false}>{dispute.ai.label}</Pill>
                    <Pill tone={SEVERITY_TONE[dispute.ai.severity]} size="sm" dot={false}>
                      {dispute.ai.severity}
                    </Pill>
                    <span className="text-[0.72rem] text-muted">
                      {Math.round((dispute.ai.confidence ?? 0) * 100)}% confidence
                      <span className="text-faint"> · {dispute.ai.source}</span>
                    </span>
                  </div>
                  <p className="mt-2.5 text-[0.84rem] leading-relaxed text-ink">
                    <span className="font-semibold">Suggested next step: </span>
                    {dispute.ai.guidance}
                  </p>
                </div>
              )}

              <blockquote className="mt-4 border-l-2 border-line pl-4 text-[0.87rem] leading-relaxed text-muted">
                {dispute.reason}
              </blockquote>

              {dispute.resolution && (
                <Alert
                  tone={dispute.resolution.outcome === 'refund_buyer' ? 'warn' : 'success'}
                  title={dispute.resolution.outcome === 'refund_buyer' ? 'Refunded to buyer' : 'Released to seller'}
                  className="mt-4"
                >
                  {dispute.resolution.note || 'No further notes.'}
                </Alert>
              )}

              {isAdmin && dispute.status !== 'resolved' && (
                <div className="mt-5 flex flex-wrap gap-2.5 border-t border-line pt-4">
                  <Button size="sm" icon={IconCheck} onClick={() => setResolving(dispute)}>
                    Resolve this dispute
                  </Button>
                  {dispute.status === 'open' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await api.disputes.review(dispute.id);
                        load();
                        toast.info('Moved to review');
                      }}
                    >
                      Mark under review
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" to={`/app/escrow/${dispute.escrowId}`} iconRight={IconArrowRight}>
                    Open escrow
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ---------- admin resolution ---------- */}
      <Modal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title="Resolve dispute"
        description={resolving ? `${resolving.escrow?.title} · ${formatNaira(resolving.escrow?.amountKobo ?? 0)}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolving(null)}>Cancel</Button>
            <Button
              variant="secondary"
              icon={IconWallet}
              loading={busy === 'refund_buyer'}
              onClick={() => resolve('refund_buyer')}
            >
              Refund buyer
            </Button>
            <Button
              variant="success"
              icon={IconShieldCheck}
              loading={busy === 'release_to_seller'}
              onClick={() => resolve('release_to_seller')}
            >
              Release to seller
            </Button>
          </>
        }
      >
        {resolving && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-[12px] border border-line bg-sunken p-3.5">
              <Avatar name={resolving.raisedByName} size={38} />
              <div className="min-w-0">
                <p className="text-[0.87rem] font-semibold text-ink">{resolving.raisedByName}</p>
                <p className="text-[0.76rem] text-muted">raised this against {resolving.againstName}</p>
              </div>
              {resolving.ai && (
                <Pill tone={SEVERITY_TONE[resolving.ai.severity]} size="sm" className="ml-auto">
                  {resolving.ai.label}
                </Pill>
              )}
            </div>

            <blockquote className="rounded-[12px] bg-sunken p-4 text-[0.86rem] leading-relaxed text-ink">
              {resolving.reason}
            </blockquote>

            <Field label="Resolution note" hint="Both parties will see this.">
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  placeholder="Seller provided tracking showing delivery on 12 August; buyer confirmed receipt."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </Field>

            <Alert tone="warn" title="This moves real money">
              Whichever outcome you choose settles the escrow immediately and updates both
              parties&rsquo; SafeScores.
            </Alert>
          </div>
        )}
      </Modal>
    </>
  );
}
