import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Alert, EmptyState, Modal, Pill, Skeleton } from '../components/ui/Primitives';
import { Field, Input, MoneyInput, Select } from '../components/ui/Form';
import { AddMoneyFlow } from '../components/Funding';
import { SuccessLottie } from '../components/SuccessLottie';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatNaira, formatDateTime, toKobo } from '../lib/format';
import {
  IconArrowDown, IconArrowUp, IconBank, IconCheck, IconPlus, IconShieldCheck,
  IconTrash, IconWallet,
} from '../components/Icons';

/**
 * The SafePay balance, and the two doors into and out of it.
 *
 * The organising idea is that a number on this page is never larger than the
 * money behind it. The balance is what a withdrawal can actually take; the
 * statement shows the SafePay fee as its own line rather than folding it into a
 * net figure; and money sitting inside a funded escrow is deliberately not
 * counted here at all, because it is not yours to spend yet.
 */

/** How each kind of movement reads in the statement. */
const ENTRY_META = {
  topup: { label: 'Money added', tone: 'success', icon: IconArrowDown },
  escrow_fund: { label: 'Into escrow', tone: 'brand', icon: IconShieldCheck },
  escrow_release: { label: 'Escrow released', tone: 'success', icon: IconArrowDown },
  escrow_refund: { label: 'Refunded to you', tone: 'warn', icon: IconArrowDown },
  fee: { label: 'SafePay fee', tone: 'neutral', icon: IconArrowUp },
  withdrawal: { label: 'Withdrawn to bank', tone: 'brand', icon: IconArrowUp },
};

export default function Wallet() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState('');       // 'add' | 'withdraw' | 'bank'

  const load = useCallback(async () => {
    try {
      setData(await api.wallet.get());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const bank = data?.bankAccount ?? null;

  if (error) {
    return (
      <>
        <PageHeader title="Wallet" />
        <Alert tone="danger" title="Could not load your wallet">{error}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Money you can spend on SafePay right now — and where it has been."
        action={<Button icon={IconPlus} onClick={() => setSheet('add')}>Add money</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          {/* ---------- balance ---------- */}
          <Card className="brand-gradient border-0 text-white">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-white/60">
              SafePay balance
            </p>
            {!data ? (
              <Skeleton className="mt-3 h-11 w-56 rounded-lg" />
            ) : (
              <p className="numeric mt-2.5 text-[2.4rem] font-bold leading-none sm:text-[2.8rem]">
                {formatNaira(data.balanceKobo)}
              </p>
            )}
            <p className="mt-2.5 max-w-md text-[0.83rem] leading-relaxed text-white/70">
              Available to fund an escrow or withdraw. Money already held inside a funded escrow
              is not counted here — it is not yours to spend until that escrow settles.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Button variant="onDark" icon={IconPlus} onClick={() => setSheet('add')}>Add money</Button>
              <Button variant="outlineOnDark" icon={IconArrowUp} onClick={() => setSheet('withdraw')}>
                Withdraw
              </Button>
            </div>
          </Card>

          {/* ---------- statement ---------- */}
          <Card>
            <CardHeader
              title="Statement"
              description="Every movement, with the balance it left behind. Fees appear as their own line."
            />
            {!data ? (
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[64px] rounded-[12px]" />)}
              </div>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={IconWallet}
                title="Nothing has moved yet"
                description="Add money to your SafePay balance and it will show up here."
                action={<Button icon={IconPlus} onClick={() => setSheet('add')}>Add money</Button>}
              />
            ) : (
              <ul className="flex flex-col">
                {entries.map((entry, i) => {
                  const meta = ENTRY_META[entry.type] ?? { label: entry.type, tone: 'neutral', icon: IconWallet };
                  const Icon = meta.icon;
                  const positive = entry.amountKobo > 0;
                  return (
                    <li key={entry.id} className={cn('flex items-center gap-3 py-3', i > 0 && 'border-t border-line')}>
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          meta.tone === 'success' && 'bg-success-soft text-success-ink',
                          meta.tone === 'brand' && 'bg-brand-soft text-brand-ink',
                          meta.tone === 'warn' && 'bg-warn-soft text-warn-ink',
                          meta.tone === 'neutral' && 'bg-neutral-soft text-neutral-ink',
                        )}
                      >
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.88rem] font-semibold text-ink">{meta.label}</p>
                        <p className="truncate text-[0.76rem] text-muted">{entry.note}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('numeric text-[0.9rem] font-semibold', positive ? 'text-success-ink' : 'text-ink')}>
                          {positive ? '+' : '−'}{formatNaira(Math.abs(entry.amountKobo))}
                        </p>
                        <p className="numeric text-[0.71rem] text-faint">
                          {formatNaira(entry.balanceAfterKobo)} · {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ---------- side ---------- */}
        <div className="flex flex-col gap-6">
          {/* bank account */}
          <Card>
            <CardHeader
              icon={IconBank}
              title="Payout account"
              description="Where a withdrawal lands. You need one before you can take money out."
            />
            {!data ? (
              <Skeleton className="h-[92px] rounded-[12px]" />
            ) : bank ? (
              <>
                <div className="rounded-[12px] border border-line bg-sunken p-3.5">
                  <p className="numeric text-[1.05rem] font-bold text-ink">{bank.accountNumber}</p>
                  <p className="mt-1 text-[0.85rem] font-semibold text-ink">{bank.accountName}</p>
                  <p className="text-[0.78rem] text-muted">{bank.bankName}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSheet('bank')}>Change</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={IconTrash}
                    onClick={async () => {
                      await api.wallet.removeBank();
                      await load();
                      toast.success('Payout account removed');
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[0.85rem] leading-relaxed text-muted">
                  Add the Nigerian bank account you want your SafePay earnings paid into.
                </p>
                <Button className="mt-4" fullWidth icon={IconPlus} onClick={() => setSheet('bank')}>
                  Add a bank account
                </Button>
              </>
            )}
          </Card>

          {/* lifetime */}
          <Card>
            <CardHeader title="Lifetime" description="What has passed through this balance." />
            {!data ? (
              <Skeleton className="h-32 rounded-[12px]" />
            ) : (
              <dl className="flex flex-col gap-3">
                {[
                  ['Added by transfer', data.totals.fundedInKobo],
                  ['Earned from escrows', data.totals.earnedKobo],
                  ['Paid into escrows', data.totals.spentKobo],
                  ['SafePay fees paid', data.totals.feesPaidKobo],
                  ['Withdrawn to bank', data.totals.withdrawnKobo],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[0.84rem] text-muted">{label}</dt>
                    <dd className="numeric text-[0.9rem] font-semibold text-ink">{formatNaira(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          {/* payouts */}
          {data?.payouts?.length > 0 && (
            <Card>
              <CardHeader title="Recent payouts" />
              <ul className="flex flex-col gap-2.5">
                {data.payouts.map((payout) => (
                  <li key={payout.id} className="flex items-center gap-3 rounded-[11px] border border-line p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink">
                      <IconCheck size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="numeric text-[0.87rem] font-semibold text-ink">{formatNaira(payout.amountKobo)}</p>
                      <p className="truncate text-[0.74rem] text-muted">
                        {payout.bankAccount.bankName} · {payout.bankAccount.accountNumber}
                      </p>
                    </div>
                    <Pill tone="success" size="sm">Paid</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* ---------- add money ---------- */}
      <Modal
        open={sheet === 'add'}
        onClose={() => { setSheet(''); load(); }}
        title="Add money to SafePay"
        description="Send a bank transfer to the account we generate, then tell us you have."
      >
        <AddMoneyFlow onFunded={() => { load(); toast.success('Balance topped up'); }} />
      </Modal>

      {/* ---------- withdraw ----------
          Rendered conditionally rather than kept mounted and hidden: a fresh
          mount is what resets the form, with no effect chasing `open`. */}
      {sheet === 'withdraw' && (
        <WithdrawModal
          onClose={() => setSheet('')}
          balanceKobo={data?.balanceKobo ?? 0}
          bank={bank}
          onAddBank={() => setSheet('bank')}
          onWithdrawn={load}
        />
      )}

      {/* ---------- bank account ---------- */}
      {sheet === 'bank' && (
        <BankModal
          banks={data?.banks ?? []}
          current={bank}
          onClose={() => setSheet('')}
          onSaved={() => { setSheet(''); load(); toast.success('Payout account saved'); }}
        />
      )}
    </>
  );
}

/* ========================================================================== */

function WithdrawModal({ onClose, balanceKobo, bank, onAddBank, onWithdrawn }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  const submit = async () => {
    const kobo = toKobo(amount);
    if (!kobo || kobo < 10_000) { setError('Enter an amount of at least ₦100.'); return; }
    if (kobo > balanceKobo) { setError('That is more than your available balance.'); return; }

    setBusy(true);
    try {
      const res = await api.wallet.withdraw(kobo);
      setSent(res.payout);
      /* Refresh the page behind the confirmation rather than after it, so the
         new balance is already there when the dialog is dismissed. */
      onWithdrawn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /* Sent. This replaces the toast that used to fire here: a payout landing is
     the one thing on this page a person actually waits to see. */
  if (sent) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Withdrawal sent"
        footer={<Button data-autofocus icon={IconCheck} onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col items-center text-center">
          <SuccessLottie variant="paid" label={`${formatNaira(sent.amountKobo)} sent to your bank`} />
          <p className="numeric text-[1.5rem] font-bold leading-none text-ink">
            {formatNaira(sent.amountKobo)}
          </p>
          <p className="mt-2.5 text-[0.88rem] leading-relaxed text-muted">
            on its way to <span className="font-semibold text-ink">{bank.bankName}</span>
            {' · '}
            <span className="numeric">{bank.accountNumber}</span>.
          </p>
        </div>
        <Alert tone="brand" title="Simulated payout" className="mt-5">
          No money left SafePay in this build. Your balance moved and a payout record was
          written, which is what a real bank transfer would leave behind.
        </Alert>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Withdraw to your bank"
      description={bank ? `Paid to ${bank.bankName} · ${bank.accountNumber}` : undefined}
      footer={bank && (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button data-autofocus icon={IconArrowUp} loading={busy} onClick={submit}>Withdraw</Button>
        </>
      )}
    >
      {!bank ? (
        <div className="flex flex-col gap-4">
          <Alert tone="warn" title="No payout account yet">
            SafePay needs to know which bank account to pay before it can send anything out.
          </Alert>
          <Button icon={IconBank} onClick={onAddBank} fullWidth>Add a bank account</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="withdraw-amount" className="mb-2 block text-[0.85rem] font-semibold text-ink">
              How much?
            </label>
            <MoneyInput id="withdraw-amount" value={amount} onChange={setAmount} autoFocus />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[0.78rem] text-muted">
                Available <span className="numeric font-semibold text-ink">{formatNaira(balanceKobo)}</span>
              </p>
              <button
                type="button"
                onClick={() => setAmount(String(balanceKobo / 100))}
                className="text-[0.78rem] font-semibold text-brand-ink hover:underline"
              >
                Withdraw everything
              </button>
            </div>
          </div>

          {error && <Alert tone="danger" title="Check the amount">{error}</Alert>}

          <Alert tone="brand" title="Simulated payout">
            No money leaves SafePay in this build — the balance moves and a payout record is
            written, which is what a real bank transfer would leave behind.
          </Alert>
        </div>
      )}
    </Modal>
  );
}

/* ========================================================================== */

function BankModal({ onClose, banks, current, onSaved }) {
  const [form, setForm] = useState(() => ({
    bankCode: current?.bankCode ?? '035',
    accountNumber: current?.accountNumber ?? '',
    accountName: current?.accountName ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.wallet.setBank(form);
      onSaved();
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
      title={current ? 'Change payout account' : 'Add a bank account'}
      description="Your SafePay earnings are withdrawn to this account."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button data-autofocus icon={IconCheck} loading={busy} onClick={submit}>Save account</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger" title="Could not save that">{error}</Alert>}

        <Field label="Bank" required>
          {(props) => (
            <Select {...props} value={form.bankCode} onChange={set('bankCode')}>
              {banks.map((bank) => (
                <option key={bank.code} value={bank.code}>{bank.name}</option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Account number" hint="Ten digits, as your bank shows it." required>
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              maxLength={10}
              placeholder="0123456789"
              className="numeric"
              value={form.accountNumber}
              onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '') }))}
            />
          )}
        </Field>

        <Field
          label="Account name"
          hint="Exactly as your bank has it. A mismatch is the single most common reason a payout fails."
          required
        >
          {(props) => (
            <Input {...props} placeholder="ADA OKONKWO" value={form.accountName} onChange={set('accountName')} />
          )}
        </Field>
      </div>
    </Modal>
  );
}
