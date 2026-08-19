import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { useAuth, useToast } from '../context/AppProviders';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { Alert } from '../components/ui/Primitives';
import { cn } from '../lib/cn';
import { IconArrowRight, IconCheck } from '../components/Icons';

/** Password strength shown as a labelled meter — never colour alone. */
function strengthOf(password) {
  if (!password) return { score: 0, label: 'Enter a password', tone: 'neutral' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak', tone: 'danger' };
  if (score === 3) return { score, label: 'Fair', tone: 'warn' };
  if (score === 4) return { score, label: 'Strong', tone: 'success' };
  return { score, label: 'Very strong', tone: 'success' };
}

export default function Signup() {
  const { signup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = strengthOf(form.password);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });

      /* Signing up no longer signs you in — the account is inert until the
       * emailed code is entered. The challenge travels in router state rather
       * than the URL so it stays out of history and referrers. */
      toast.info('Check your email', 'We sent you a 6-digit code to confirm your address.');
      navigate('/verify', {
        replace: true,
        state: { challengeId: result.challengeId, email: result.email, next: '/app' },
      });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const meterTone = {
    neutral: 'bg-line',
    danger: 'bg-danger',
    warn: 'bg-warn',
    success: 'bg-success',
  }[strength.tone];

  const labelTone = {
    neutral: 'text-faint',
    danger: 'text-danger-ink',
    warn: 'text-warn-ink',
    success: 'text-success-ink',
  }[strength.tone];

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes about a minute. No card needed."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-ink hover:underline">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title="Could not create your account">{formError}</Alert>}

        <Field label="Full name" error={errors.name} required>
          {(props) => (
            <Input
              {...props}
              autoComplete="name"
              placeholder="Ada Okonkwo"
              value={form.name}
              onChange={set('name')}
              onBlur={validate}
              invalid={Boolean(errors.name)}
            />
          )}
        </Field>

        <Field label="Email address" error={errors.email} required>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={set('email')}
              onBlur={validate}
              invalid={Boolean(errors.email)}
            />
          )}
        </Field>

        <Field
          label="Phone number"
          hint="Optional now — but verifying it lifts your SafeScore straight away."
          error={errors.phone}
        >
          {(props) => (
            <Input
              {...props}
              type="tel"
              autoComplete="tel"
              placeholder="+234 801 234 5678"
              value={form.phone}
              onChange={set('phone')}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password} required>
          {(props) => (
            <>
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={set('password')}
                invalid={Boolean(errors.password)}
              />
              <div className="mt-2 flex items-center gap-2.5">
                <div className="flex flex-1 gap-1" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors duration-200',
                        i < strength.score ? meterTone : 'bg-line',
                      )}
                    />
                  ))}
                </div>
                <span className={cn('w-[74px] text-right text-[0.72rem] font-semibold', labelTone)}>
                  {strength.label}
                </span>
              </div>
            </>
          )}
        </Field>

        <Button type="submit" size="lg" fullWidth loading={loading} iconRight={loading ? undefined : IconArrowRight}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>

        <ul className="mt-1 flex flex-col gap-1.5">
          {['We email a 6-digit code to confirm your address',
            'No monthly fee — 1.5% only when an escrow settles',
            'Sandbox API keys included from day one',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-[0.79rem] text-muted">
              <IconCheck size={13} className="mt-0.5 shrink-0 text-success" />
              {line}
            </li>
          ))}
        </ul>
      </form>
    </AuthLayout>
  );
}
