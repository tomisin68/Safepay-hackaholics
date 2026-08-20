import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Alert, CopyField, Pill } from './ui/Primitives';
import { MoneyInput } from './ui/Form';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatNaira, toKobo } from '../lib/format';
import { IconBank, IconCheck, IconClock, IconRefresh, IconWallet } from './Icons';

/**
 * Adding money to SafePay.
 *
 * A Nigerian buyer expects one thing here: an account number they can paste
 * into their own bank app. So that is what this shows — a Wema account, in
 * SafePay's name, for one exact amount, with a countdown on it. That is how a
 * real one-time virtual account behaves, and the countdown is why the number is
 * safe to show at all: it stops being payable long before anyone could reuse it.
 *
 * Nothing here moves real money. There is no Wema API call, the account number
 * is generated, and "I have already sent it" does what a bank webhook would do
 * in production. The panel says so, in the interface, every time — a mocked
 * payment rail that lets you believe it is real is worse than no rail at all.
 */

/** Common top-up sizes, so the usual case is one tap. */
const QUICK_AMOUNTS = [5_000, 20_000, 50_000, 100_000, 250_000];

/**
 * Ticks once a second and returns the milliseconds left.
 *
 * The remaining time is derived during render rather than stored, so a new
 * expiry is reflected on the very next paint — storing it would need an effect
 * to re-seed the state, and that effect would render the old number once.
 */
function useCountdown(expiresAt) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return msLeft(expiresAt);
}

const msLeft = (iso) => (iso ? Math.max(0, new Date(iso).getTime() - Date.now()) : 0);

const clock = (ms) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/* ========================================================================== */

/**
 * The account details themselves, once a top-up exists.
 *
 * @param {object}   props.topup      as returned by the API
 * @param {Function} props.onConfirm  called when the mock transfer is claimed
 * @param {Function} props.onRestart  ask for a fresh number after expiry
 */
export function VirtualAccountCard({ topup, onConfirm, onRestart, busy, error }) {
  const remaining = useCountdown(topup?.expiresAt);
  const expired = topup?.status === 'expired' || (topup?.status === 'pending' && remaining <= 0);
  /* The last two minutes are the ones people miss, so the clock changes colour
     rather than only changing number. */
  const urgent = !expired && remaining < 120_000;

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warn" title="Simulated transfer">
        This is a hackathon build. The account below is not a real Wema account and no money
        moves — <span className="font-semibold">I have already sent it</span> stands in for the
        bank confirming your transfer.
      </Alert>

      <div className="rounded-[14px] border border-brand-line bg-brand-soft/50 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-brand-ink">
              <IconBank size={18} />
            </span>
            <div>
              <p className="text-[0.9rem] font-semibold text-ink">{topup.bankName}</p>
              <p className="text-[0.76rem] text-muted">Transfer exactly this amount</p>
            </div>
          </div>

          <Pill tone={expired ? 'danger' : urgent ? 'warn' : 'brand'} icon={IconClock} size="sm">
            {expired ? 'Expired' : clock(remaining)}
          </Pill>
        </div>

        <p className="numeric mt-4 text-[1.9rem] font-bold leading-none text-ink">
          {formatNaira(topup.amountKobo)}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <CopyField label="Account number" value={topup.accountNumber} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
              <p className="text-[0.72rem] font-semibold text-muted">Account name</p>
              <p className="mt-0.5 text-[0.88rem] font-semibold text-ink">{topup.accountName}</p>
            </div>
            <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
              <p className="text-[0.72rem] font-semibold text-muted">Reference</p>
              <p className="numeric mt-0.5 text-[0.88rem] font-semibold text-ink">{topup.reference}</p>
            </div>
          </div>
        </div>

        <p className={cn('mt-3.5 text-[0.78rem] leading-relaxed', expired ? 'text-danger-ink' : 'text-muted')}>
          {expired
            ? 'This account number has expired. Generate a new one to continue.'
            : 'The account number stops working when the timer runs out. Send the exact amount from any Nigerian bank app.'}
        </p>
      </div>

      {error && <Alert tone="danger" title="That did not work">{error}</Alert>}

      {expired ? (
        <Button icon={IconRefresh} onClick={onRestart} loading={busy}>Get a new account number</Button>
      ) : (
        <Button icon={IconCheck} onClick={onConfirm} loading={busy} fullWidth>
          I have already sent it
        </Button>
      )}
    </div>
  );
}

/* ========================================================================== */

/**
 * The whole add-money flow: amount, then account details, then done.
 *
 * Used on the wallet screen and inside the escrow funding dialog, which is why
 * it takes an initial amount and reports the new balance upward rather than
 * owning any of that state itself.
 *
 * @param {number}   [props.initialKobo]   pre-fills the amount (an escrow shortfall)
 * @param {Function} props.onFunded        `(balanceKobo) => void` after a successful top-up
 */
export function AddMoneyFlow({ initialKobo = 0, onFunded, submitLabel = 'Generate account number' }) {
  const [amount, setAmount] = useState(initialKobo ? String(initialKobo / 100) : '');
  const [topup, setTopup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const mounted = useRef(true);

  /* Set on mount as well as cleared on unmount. StrictMode runs an effect
     mount -> cleanup -> mount in development, so a cleanup-only version latches
     `false` on the first pass and every setState below is silently dropped —
     which shows up as a button that spins forever. */
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const start = useCallback(async (kobo) => {
    setBusy(true);
    setError('');
    try {
      const { topup: created } = await api.wallet.createTopup(kobo);
      if (mounted.current) setTopup(created);
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const submitAmount = (e) => {
    e.preventDefault();
    const kobo = toKobo(amount);
    if (!kobo || kobo < 10_000) {
      setError('Enter an amount of at least ₦100.');
      return;
    }
    start(kobo);
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.wallet.confirmTopup(topup.id);
      if (!mounted.current) return;
      setDone(res);
      onFunded?.(res.balanceKobo);
    } catch (err) {
      if (!mounted.current) return;
      setError(err.message);
      /* An expired session has to *look* expired, or the button just fails
         over and over with no explanation on the card above it. */
      if (err.details?.code === 'topup_expired') setTopup((t) => ({ ...t, status: 'expired' }));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success-ink">
          <IconCheck size={26} />
        </span>
        <p className="mt-4 text-[1.05rem] font-semibold text-ink">
          {formatNaira(done.topup.amountKobo)} added
        </p>
        <p className="mt-1.5 text-[0.86rem] text-muted">
          Your SafePay balance is now <span className="numeric font-semibold text-ink">{formatNaira(done.balanceKobo)}</span>.
        </p>
      </div>
    );
  }

  if (topup) {
    return (
      <VirtualAccountCard
        topup={topup}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onRestart={() => start(topup.amountKobo)}
      />
    );
  }

  return (
    <form onSubmit={submitAmount} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="topup-amount" className="mb-2 block text-[0.85rem] font-semibold text-ink">
          How much are you adding?
        </label>
        <MoneyInput id="topup-amount" value={amount} onChange={setAmount} autoFocus />
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((naira) => (
          <button
            key={naira}
            type="button"
            onClick={() => { setAmount(String(naira)); setError(''); }}
            className="rounded-full border border-line px-3 py-1.5 text-[0.78rem] font-semibold text-muted transition-colors hover:border-brand/45 hover:text-brand-ink"
          >
            {formatNaira(naira * 100, { decimals: false })}
          </button>
        ))}
      </div>

      {error && <Alert tone="danger" title="Check the amount">{error}</Alert>}

      <Button type="submit" icon={IconWallet} loading={busy} fullWidth>{submitLabel}</Button>

      <p className="text-center text-[0.76rem] leading-relaxed text-faint">
        You will get a Wema account number in SafePay&rsquo;s name, valid for 30 minutes.
      </p>
    </form>
  );
}
