import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, Alert, Pill } from '../components/ui/Primitives';
import { Field, Input, Textarea, MoneyInput, OptionCards } from '../components/ui/Form';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatNaira, toKobo, ESCROW_TYPE_LABELS } from '../lib/format';
import {
  IconWallet, IconCode, IconBank, IconQr, IconRefresh, IconArrowRight, IconArrowLeft,
  IconCheck, IconShieldCheck, IconPlus, IconX, IconUser,
} from '../components/Icons';

const TYPES = [
  { value: 'goods', label: 'Goods', description: 'A physical item — phone, laptop, clothes', icon: IconWallet },
  { value: 'service_milestone', label: 'Service', description: 'Work paid in stages as it is delivered', icon: IconCode },
  { value: 'rental', label: 'Rent or deposit', description: 'Accommodation, caution fee, equipment', icon: IconBank },
  { value: 'in_person', label: 'In person', description: 'Handing over face to face, with a QR code', icon: IconQr },
  { value: 'recurring', label: 'Recurring', description: 'A repeating subscription or plan', icon: IconRefresh },
];

const FEE_RATE = 0.015;
const STEPS = ['What are you paying for?', 'Who and how much', 'Check and confirm'];

export default function NewEscrow() {
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    type: 'goods',
    role: 'buyer',
    amount: '',
    title: '',
    description: '',
    sellerEmail: '',
  });
  const [milestones, setMilestones] = useState([
    { title: '', amount: '' },
    { title: '', amount: '' },
  ]);

  const isMilestone = form.type === 'service_milestone';

  const amountKobo = useMemo(() => {
    if (isMilestone) {
      return milestones.reduce((sum, m) => sum + toKobo(m.amount || 0), 0);
    }
    return toKobo(form.amount || 0);
  }, [form.amount, milestones, isMilestone]);

  const feeKobo = Math.round(amountKobo * FEE_RATE);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const setEvent = (key) => (e) => set(key)(e.target.value);

  const validateStep = (index) => {
    const next = {};
    if (index === 1) {
      if (!form.title.trim() || form.title.trim().length < 3) {
        next.title = 'Give this escrow a short, clear name.';
      }
      if (form.type !== 'in_person' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.sellerEmail.trim())) {
        next.sellerEmail = 'Enter the other person’s email address.';
      }
      if (amountKobo < 10000) {
        next.amount = 'The minimum escrow is ₦100.00.';
      }
      if (isMilestone) {
        const filled = milestones.filter((m) => m.title.trim() && toKobo(m.amount) > 0);
        if (filled.length < 1) next.milestones = 'Add at least one milestone with a title and amount.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    setFormError('');
    if (!validateStep(1)) { setStep(1); return; }

    setSubmitting(true);
    try {
      const payload = {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        amountKobo,
        role: form.role,
      };
      if (form.type !== 'in_person') payload.sellerEmail = form.sellerEmail.trim();
      if (isMilestone) {
        payload.milestones = milestones
          .filter((m) => m.title.trim() && toKobo(m.amount) > 0)
          .map((m) => ({ title: m.title.trim(), amountKobo: toKobo(m.amount) }));
      }

      const { escrow, flags } = await api.escrows.create(payload);
      toast.success('Escrow created', 'Next step: fund it so the seller can act with confidence.');
      if (flags?.length) {
        toast.info('Flagged for review', flags.join(' · '));
      }
      navigate(`/app/escrow/${escrow.id}`);
    } catch (err) {
      setFormError(err.message);
      setSubmitting(false);
    }
  };

  const updateMilestone = (index, key, value) => {
    setMilestones((list) => list.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
    if (errors.milestones) setErrors((p) => ({ ...p, milestones: undefined }));
  };

  return (
    <>
      <PageHeader
        title="New escrow"
        description="SafePay will hold the money until both sides confirm they are happy."
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <Card>
          {/* ---------- step indicator ---------- */}
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

          {formError && <Alert tone="danger" title="Could not create this escrow" className="mb-5">{formError}</Alert>}

          {/* ---------- step 1 ---------- */}
          {step === 0 && (
            <div className="animate-fade">
              <h2 className="text-[1.15rem] font-semibold text-ink">What are you paying for?</h2>
              <p className="mt-1.5 text-[0.88rem] text-muted">
                This decides how the money is released — in one go when you confirm, or a
                milestone at a time as the work lands.
              </p>

              <div className="mt-5">
                <OptionCards name="type" options={TYPES} value={form.type} onChange={set('type')} />
              </div>

              <div className="mt-6">
                <p className="mb-2 text-[0.85rem] font-semibold text-ink">Are you the buyer or the seller?</p>
                <OptionCards
                  name="role"
                  value={form.role}
                  onChange={set('role')}
                  options={[
                    { value: 'buyer', label: 'I am paying', description: 'You fund the escrow', icon: IconWallet },
                    { value: 'seller', label: 'I am receiving', description: 'You get paid on release', icon: IconUser },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ---------- step 2 ---------- */}
          {step === 1 && (
            <div className="animate-fade flex flex-col gap-5">
              <div>
                <h2 className="text-[1.15rem] font-semibold text-ink">Who and how much</h2>
                <p className="mt-1.5 text-[0.88rem] text-muted">
                  {form.type === 'in_person'
                    ? 'You will get a QR code to show the other person — no email needed.'
                    : 'We will link this escrow to their SafePay account.'}
                </p>
              </div>

              <Field label="What is this for?" error={errors.title} required>
                {(props) => (
                  <Input
                    {...props}
                    placeholder="iPhone 13 Pro, 256GB"
                    value={form.title}
                    onChange={setEvent('title')}
                    invalid={Boolean(errors.title)}
                    maxLength={140}
                  />
                )}
              </Field>

              {form.type !== 'in_person' && (
                <Field
                  label={form.role === 'buyer' ? 'Seller’s email' : 'Buyer’s email'}
                  hint="If they are not on SafePay yet, we will invite them."
                  error={errors.sellerEmail}
                  required
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="email"
                      placeholder="them@example.com"
                      value={form.sellerEmail}
                      onChange={setEvent('sellerEmail')}
                      invalid={Boolean(errors.sellerEmail)}
                    />
                  )}
                </Field>
              )}

              {isMilestone ? (
                <Field
                  label="Milestones"
                  hint="Each milestone is funded together but released separately as the work lands."
                  error={errors.milestones || errors.amount}
                >
                  <div className="flex flex-col gap-2.5">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-[0.78rem] font-semibold text-muted">
                          {i + 1}
                        </span>
                        <Input
                          placeholder={`Milestone ${i + 1}`}
                          value={m.title}
                          onChange={(e) => updateMilestone(i, 'title', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          prefix="₦"
                          inputMode="decimal"
                          placeholder="0"
                          value={m.amount}
                          onChange={(e) => updateMilestone(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))}
                          className="w-[130px]"
                        />
                        {milestones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMilestones((l) => l.filter((_, idx) => idx !== i))}
                            aria-label={`Remove milestone ${i + 1}`}
                            className="shrink-0 rounded-[9px] p-2 text-faint transition-colors hover:bg-danger-soft hover:text-danger-ink"
                          >
                            <IconX size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMilestones((l) => [...l, { title: '', amount: '' }])}
                      className="inline-flex items-center gap-1.5 self-start rounded-[9px] px-2 py-1.5 text-[0.82rem] font-semibold text-brand-ink transition-colors hover:bg-brand-soft"
                    >
                      <IconPlus size={14} />
                      Add milestone
                    </button>
                  </div>
                </Field>
              ) : (
                <Field label="Amount" error={errors.amount} required hint="This is what the buyer pays into escrow.">
                  {(props) => (
                    <MoneyInput
                      {...props}
                      value={form.amount}
                      onChange={set('amount')}
                      invalid={Boolean(errors.amount)}
                    />
                  )}
                </Field>
              )}

              <Field label="Extra details" hint="Optional — condition, delivery arrangement, anything agreed.">
                {(props) => (
                  <Textarea
                    {...props}
                    rows={3}
                    placeholder="Space grey, battery health 91%. Meeting at Ikeja City Mall on Saturday."
                    value={form.description}
                    onChange={setEvent('description')}
                    maxLength={2000}
                  />
                )}
              </Field>
            </div>
          )}

          {/* ---------- step 3 ---------- */}
          {step === 2 && (
            <div className="animate-fade">
              <h2 className="text-[1.15rem] font-semibold text-ink">Check and confirm</h2>
              <p className="mt-1.5 text-[0.88rem] text-muted">
                Nothing moves until you fund it on the next screen.
              </p>

              <dl className="mt-5 divide-y divide-line rounded-[13px] border border-line">
                {[
                  ['Type', ESCROW_TYPE_LABELS[form.type]],
                  ['What for', form.title || '—'],
                  ['Your role', form.role === 'buyer' ? 'Buyer — you pay' : 'Seller — you get paid'],
                  form.type !== 'in_person' && [
                    form.role === 'buyer' ? 'Seller' : 'Buyer',
                    form.sellerEmail || '—',
                  ],
                  form.description && ['Details', form.description],
                ]
                  .filter(Boolean)
                  .map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                      <dt className="text-[0.8rem] font-medium text-muted">{label}</dt>
                      <dd className="text-[0.88rem] font-medium text-ink sm:max-w-[62%] sm:text-right">{value}</dd>
                    </div>
                  ))}
              </dl>

              {isMilestone && (
                <ul className="mt-3 flex flex-col gap-2">
                  {milestones
                    .filter((m) => m.title.trim())
                    .map((m, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-[11px] border border-line bg-sunken px-3.5 py-2.5">
                        <span className="text-[0.85rem] text-ink">
                          <span className="text-faint">{i + 1}.</span> {m.title}
                        </span>
                        <span className="numeric text-[0.85rem] font-semibold text-ink">
                          {formatNaira(toKobo(m.amount || 0))}
                        </span>
                      </li>
                    ))}
                </ul>
              )}

              <Alert tone="brand" title="What happens next" className="mt-5">
                You fund the escrow, SafePay holds the money, the seller delivers, and you release.
                If it is not funded, nobody is committed to anything.
              </Alert>
            </div>
          )}

          {/* ---------- nav ---------- */}
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              variant="ghost"
              icon={IconArrowLeft}
              onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
              disabled={submitting}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={goNext} iconRight={IconArrowRight}>Continue</Button>
            ) : (
              <Button onClick={submit} loading={submitting} icon={IconShieldCheck}>
                {submitting ? 'Creating…' : 'Create escrow'}
              </Button>
            )}
          </div>
        </Card>

        {/* ---------- live summary ---------- */}
        <Card className="lg:sticky lg:top-6">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-faint">Summary</p>

          <div className="mt-4 rounded-[13px] bg-sunken p-4">
            <p className="text-[0.78rem] text-muted">Amount in escrow</p>
            <p className="numeric mt-1 text-[1.85rem] font-bold leading-none text-ink">
              {formatNaira(amountKobo)}
            </p>
          </div>

          <dl className="mt-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[0.83rem] text-muted">SafePay fee (1.5%)</dt>
              <dd className="numeric text-[0.87rem] font-medium text-ink">{formatNaira(feeKobo)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="text-[0.83rem] font-medium text-ink">
                {form.role === 'buyer' ? 'Seller receives' : 'You receive'}
              </dt>
              <dd className="numeric text-[0.95rem] font-semibold text-ink">
                {formatNaira(Math.max(0, amountKobo - feeKobo))}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5">
            {[
              'Money is held, not sent',
              'Released only when you confirm',
              'Auto-releases if nobody acts',
              'Disputes freeze the funds',
            ].map((line) => (
              <p key={line} className="flex items-start gap-2 text-[0.81rem] text-muted">
                <IconCheck size={13} className="mt-0.5 shrink-0 text-success" />
                {line}
              </p>
            ))}
          </div>

          {form.type === 'in_person' && (
            <Pill tone="brand" className="mt-5">QR claim code will be generated</Pill>
          )}
        </Card>
      </div>
    </>
  );
}
