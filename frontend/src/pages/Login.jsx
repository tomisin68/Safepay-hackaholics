import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { useAuth, useToast } from '../context/AppProviders';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { Alert } from '../components/ui/Primitives';
import { isDemoMode } from '../lib/api';
import { IconArrowRight, IconSpark } from '../components/Icons';

const DEMO_ACCOUNTS = [
  { email: 'ada@safepay.test', label: 'Ada — active buyer' },
  { email: 'tunde@safepay.test', label: 'Tunde — trusted seller' },
  { email: 'admin@safepay.test', label: 'Ops — admin console' },
];

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'That does not look like a valid email.';
    if (!form.password) next.password = 'Enter your password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const user = await login({ email: form.email.trim(), password: form.password });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(params.get('next') || '/app', { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (email) => {
    setForm({ email, password: 'password123' });
    setErrors({});
    setFormError('');
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see where your money is."
      footer={
        <>
          New to SafePay?{' '}
          <Link to="/signup" className="font-semibold text-brand-ink hover:underline">Create an account</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title="Could not sign you in">{formError}</Alert>}

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

        <Field label="Password" error={errors.password} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={set('password')}
              invalid={Boolean(errors.password)}
            />
          )}
        </Field>

        <Button type="submit" size="lg" fullWidth loading={loading} iconRight={loading ? undefined : IconArrowRight}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-8 rounded-[13px] border border-brand-line bg-brand-soft p-4">
        <div className="flex items-center gap-2">
          <IconSpark size={16} className="text-brand" />
          <p className="text-[0.83rem] font-semibold text-brand-ink">Demo accounts</p>
        </div>
        <p className="mt-1.5 text-[0.79rem] leading-relaxed text-muted">
          Judging this build? Tap an account to fill the form — the password is
          <span className="numeric"> password123</span>.
          {isDemoMode && ' This deployment runs on seeded data in your browser, so no API is needed.'}
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemoAccount(account.email)}
              /* Stacked below sm: side by side, the email wraps mid-address on a
                 narrow phone and the row loses its shape. */
              className="flex min-h-[44px] flex-col gap-0.5 rounded-[9px] border border-brand-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="text-[0.8rem] font-medium text-ink">{account.label}</span>
              <span className="numeric truncate text-[0.72rem] text-muted">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
