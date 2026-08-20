import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, EmptyState, Skeleton, Alert, Pill } from '../components/ui/Primitives';
import { StatTile } from '../components/Charts';
import { EscrowCard } from '../components/Escrow';
import { ScoreRing } from '../components/Trust';
import { useAuth } from '../context/AppProviders';
import { api } from '../lib/api';
import { formatNaira, SCORE_TIER_META } from '../lib/format';
import {
  IconWallet, IconShieldCheck, IconScale, IconClock, IconPlus, IconArrowRight,
  IconQr, IconCode, IconAlertTriangle, IconBank,
} from '../components/Icons';

export default function Dashboard() {
  const { user, score } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.escrows
      .list()
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const summary = data?.summary;
  const escrows = useMemo(() => data?.escrows ?? [], [data]);

  /* What actually needs this person right now — the whole point of the page. */
  const needsYou = useMemo(
    () =>
      escrows.filter((e) => {
        const isBuyer = e.buyer?.id === user?.id;
        if (isBuyer && e.status === 'created') return true;      // fund it
        if (isBuyer && e.status === 'in_progress') return true;  // confirm it
        if (!isBuyer && e.status === 'funded') return true;      // deliver it
        return false;
      }),
    [escrows, user?.id],
  );

  const recent = escrows.slice(0, 6);
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const tierMeta = SCORE_TIER_META[score?.tier ?? 'new'];

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        description="Here is where your money is right now."
        action={<Button to="/app/new" icon={IconPlus}>New escrow</Button>}
      />

      {error && <Alert tone="danger" title="Could not load your escrows" className="mb-6">{error}</Alert>}

      {/* ---------- stat tiles ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-[14px]" />)
        ) : (
          <>
            {/* Balance first, and it is the wallet balance rather than a total
                of anything: it is the only figure here that answers "what can
                I actually spend right now". */}
            <StatTile
              label="SafePay balance"
              value={formatNaira(summary.balanceKobo ?? 0, { decimals: false })}
              sublabel="Available to spend or withdraw"
              icon={IconWallet}
              tone="brand"
            />
            <StatTile
              label="Held in escrow"
              value={formatNaira(summary.inEscrowKobo, { decimals: false })}
              sublabel="Locked until an escrow settles"
              icon={IconShieldCheck}
              tone="success"
            />
            <StatTile
              label="Needs your action"
              value={needsYou.length}
              sublabel={needsYou.length ? 'Waiting on you' : 'Nothing pending'}
              icon={IconClock}
              tone={needsYou.length ? 'warn' : 'neutral'}
            />
            <StatTile
              label="Open disputes"
              value={summary.openDisputes}
              sublabel={summary.openDisputes ? 'Under review' : 'All clear'}
              icon={IconScale}
              tone={summary.openDisputes ? 'danger' : 'neutral'}
            />
          </>
        )}
      </div>

      {/* Settled money is reported net of the SafePay fee, and the fee is named
          next to it. Quoting the gross would tell a seller they received a
          number they never saw in their balance. */}
      {summary && summary.releasedKobo > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-[12px] border border-line bg-raised px-4 py-3">
          <p className="text-[0.82rem] text-muted">
            Settled through SafePay{' '}
            <span className="numeric font-semibold text-ink">{formatNaira(summary.releasedKobo)}</span>
          </p>
          {summary.feesPaidKobo > 0 && (
            <p className="text-[0.82rem] text-muted">
              SafePay fees paid{' '}
              <span className="numeric font-semibold text-ink">{formatNaira(summary.feesPaidKobo)}</span>
            </p>
          )}
          <Link to="/app/wallet" className="ml-auto text-[0.82rem] font-semibold text-brand-ink hover:underline">
            Open wallet
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-6">
          {/* ---------- needs your action ---------- */}
          {needsYou.length > 0 && (
            <Card className="border-warn/30 bg-warn-soft/40">
              <CardHeader
                icon={IconAlertTriangle}
                title="Waiting on you"
                description="These escrows cannot move forward until you act."
              />
              <div className="flex flex-col gap-2.5">
                {needsYou.slice(0, 3).map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} viewerId={user?.id} />
                ))}
              </div>
            </Card>
          )}

          {/* ---------- recent activity ---------- */}
          <Card>
            <CardHeader
              title="Recent escrows"
              description="Everything you are buying or selling through SafePay."
              action={
                escrows.length > 0 && (
                  <Button to="/app/escrows" variant="ghost" size="sm" iconRight={IconArrowRight}>
                    View all
                  </Button>
                )
              }
            />

            {!data ? (
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-[13px]" />)}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={IconWallet}
                title="No escrows yet"
                description="Open your first escrow and SafePay will hold the money until both sides are happy."
                action={<Button to="/app/new" icon={IconPlus}>Create an escrow</Button>}
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {recent.map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} viewerId={user?.id} />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ---------- side column ---------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Your SafeScore" description={tierMeta?.blurb} />
            <div className="flex flex-col items-center">
              <ScoreRing score={score?.score ?? 0} tier={score?.tier ?? 'new'} size={128} />
              <Link
                to="/app/trust"
                className="mt-5 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-brand-ink transition-colors hover:underline"
              >
                See how it is calculated
                <IconArrowRight size={14} />
              </Link>
            </div>

            {score?.stats && (
              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-line pt-5">
                {[
                  ['Completed', score.stats.escrowsCompleted],
                  ['Dispute rate', `${score.stats.disputeRatePct}%`],
                  ['Counterparties', score.stats.uniqueCounterparties],
                  ['Verification', (score.stats.verificationTier ?? 'none').replace('_', '/')],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[0.72rem] font-medium text-faint">{label}</dt>
                    <dd className="numeric mt-0.5 text-[0.93rem] font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader title="Quick actions" />
            <div className="flex flex-col gap-2">
              {[
                { to: '/app/wallet', icon: IconBank, title: 'Add money', body: 'Top up by bank transfer' },
                { to: '/app/claim', icon: IconQr, title: 'Scan a claim code', body: 'Join an in-person escrow' },
                { to: '/app/disputes', icon: IconScale, title: 'Raise a dispute', body: 'Something went wrong' },
                { to: '/app/developer', icon: IconCode, title: 'Get API keys', body: 'Add SafePay to your app' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center gap-3 rounded-[11px] border border-line p-3 transition-all duration-200 hover:border-brand/45 hover:bg-raised"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
                    <item.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.87rem] font-semibold text-ink">{item.title}</span>
                    <span className="block text-[0.76rem] text-muted">{item.body}</span>
                  </span>
                  <IconArrowRight
                    size={15}
                    className="shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="brand-gradient border-0 text-white">
            <div className="flex items-start gap-3">
              <IconShieldCheck size={22} className="mt-0.5 shrink-0 text-[#33CBB0]" />
              <div>
                <p className="text-[0.95rem] font-semibold">Protected by SafePay</p>
                <p className="mt-1.5 text-[0.83rem] leading-relaxed text-white/75">
                  Every escrow is written to an append-only ledger, and a share of each fee funds
                  the Buyer Protection Reserve.
                </p>
                <Pill tone="success" size="sm" className="mt-3 border-white/20 bg-white/12 text-white">
                  Reserve active
                </Pill>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
