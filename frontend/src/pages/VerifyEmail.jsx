import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { useAuth, useToast } from '../context/AppProviders';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Primitives';
import { cn } from '../lib/cn';
import { IconArrowRight, IconLock } from '../components/Icons';

const LENGTH = 6;
const RESEND_COOLDOWN = 60; // matches the server-side cooldown in services/otp.js

/**
 * Six separate boxes rather than one input, because that is what people expect
 * of a code field now — and because paste, arrow keys, and backspace all need
 * handling that a plain text input does not give for free.
 *
 * `value` is the source of truth as a single string; the boxes are a rendering
 * of it. That keeps paste-of-six and type-one-at-a-time on the same code path.
 */
function CodeInput({ value, onChange, onComplete, disabled, invalid, autoFocus }) {
  const refs = useRef([]);

  const digits = useMemo(
    () => Array.from({ length: LENGTH }, (_, i) => value[i] ?? ''),
    [value],
  );

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
    return clean;
  };

  const handleChange = (index) => (event) => {
    const typed = event.target.value.replace(/\D/g, '');
    if (!typed) return;

    /* A full code arriving at once is a paste (or an SMS/email autofill), even
     * when it lands on a box halfway along. Take the whole thing. */
    if (typed.length >= LENGTH) {
      const clean = commit(typed);
      refs.current[Math.min(clean.length, LENGTH - 1)]?.focus();
      return;
    }

    const chars = value.split('');
    // Typing over a filled box replaces that digit rather than appending.
    typed.split('').forEach((char, offset) => {
      if (index + offset < LENGTH) chars[index + offset] = char;
    });
    const clean = commit(chars.join('').slice(0, LENGTH));

    const nextIndex = Math.min(index + typed.length, LENGTH - 1);
    refs.current[nextIndex]?.focus();
    if (clean.length === LENGTH) refs.current[LENGTH - 1]?.blur();
  };

  const handleKeyDown = (index) => (event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const chars = value.split('');
      if (chars[index]) {
        // Clear this box and stay put.
        chars[index] = '';
        onChange(chars.join('').replace(/\s/g, ''));
      } else if (index > 0) {
        // Already empty — step back and clear that one instead.
        chars[index - 1] = '';
        onChange(chars.slice(0, index - 1).join(''));
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    const clean = commit(pasted);
    refs.current[Math.min(clean.length, LENGTH - 1)]?.focus();
  };

  return (
    <div
      className="flex justify-between gap-1.5 sm:gap-2.5"
      role="group"
      aria-label={`${LENGTH}-digit verification code`}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          onChange={handleChange(index)}
          onKeyDown={handleKeyDown(index)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'numeric h-[54px] min-w-0 flex-1 rounded-[11px] border-2 bg-surface text-center',
            'text-[1.4rem] font-semibold text-ink transition-[border-color,box-shadow] duration-200',
            'focus:outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15',
            'disabled:opacity-60 disabled:bg-sunken',
            invalid ? 'border-danger' : digit ? 'border-brand/45' : 'border-line-strong',
          )}
        />
      ))}
    </div>
  );
}

/**
 * The compulsory step between creating an account and having one.
 *
 * Reached only with a challenge handed over by /signup or /login, which arrives
 * through router state rather than the URL — a challenge id in a query string
 * would end up in browser history, referrers, and shared links.
 *
 * Landing here without that state means a reload or a pasted URL, so there is
 * nothing to verify against: the page says so and sends the user back to sign in
 * for a fresh code, rather than showing a form that cannot work.
 */
export default function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { state } = useLocation();

  const [challengeId, setChallengeId] = useState(state?.challengeId ?? null);
  const [email] = useState(state?.email ?? '');
  const [next] = useState(state?.next ?? '/app');

  const [code, setCode] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  /* Guards a double submit: the code completing fires onComplete, and the user
   * may also hit the button before the first request resolves. */
  const submitting = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = useCallback(async (submittedCode) => {
    const value = String(submittedCode ?? code).trim();
    if (value.length !== LENGTH || submitting.current) return;

    submitting.current = true;
    setLoading(true);
    setFormError('');

    try {
      const result = await verifyEmail({ challengeId, code: value });
      toast.success('Email confirmed', `Welcome to SafePay, ${result.user.name.split(' ')[0]}.`);
      navigate(next, { replace: true });
    } catch (err) {
      setFormError(err.message);
      // Clear on failure so the next attempt starts from an empty field rather
      // than needing six backspaces first.
      setCode('');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [code, challengeId, verifyEmail, toast, navigate, next]);

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setFormError('');
    try {
      const data = await resendCode(challengeId);
      // The server may hand back a rotated challenge; keep whatever it says.
      if (data?.challengeId) setChallengeId(data.challengeId);
      setCode('');
      setCooldown(RESEND_COOLDOWN);
      toast.info('New code sent', 'Check your inbox — the previous code no longer works.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setResending(false);
    }
  };

  /* No challenge means no code to check. Say that plainly instead of rendering a
   * form whose only possible outcome is an error. */
  if (!challengeId) {
    return (
      <AuthLayout
        title="Start again from sign in"
        subtitle="This page needs a verification code that is still in progress."
      >
        <Alert tone="warn" title="Nothing to verify">
          Verification links are single-use and are not carried across a page reload. Sign in again
          and we will email you a fresh code.
        </Alert>
        <Button to="/login" size="lg" fullWidth className="mt-6" iconRight={IconArrowRight}>
          Go to sign in
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        email
          ? `We sent a ${LENGTH}-digit code to ${email}. Enter it below to finish securing your account.`
          : `Enter the ${LENGTH}-digit code we just emailed you.`
      }
      footer={
        <>
          Wrong address?{' '}
          <Link to="/signup" className="font-semibold text-brand-ink hover:underline">Start over</Link>
        </>
      }
    >
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        noValidate
        className="flex flex-col gap-5"
      >
        {formError && <Alert tone="danger" title="Could not confirm your email">{formError}</Alert>}

        <CodeInput
          value={code}
          onChange={(next2) => { setCode(next2); if (formError) setFormError(''); }}
          onComplete={submit}
          disabled={loading}
          invalid={Boolean(formError)}
          autoFocus
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={loading}
          disabled={code.length !== LENGTH}
          iconRight={loading ? undefined : IconArrowRight}
        >
          {loading ? 'Confirming…' : 'Confirm email'}
        </Button>

        <div className="flex items-center justify-center gap-1.5 text-[0.83rem] text-muted">
          <span>Didn&apos;t get it?</span>
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0 || resending}
            className={cn(
              'font-semibold transition-colors',
              cooldown > 0 || resending
                ? 'cursor-not-allowed text-faint'
                : 'text-brand-ink hover:underline',
            )}
          >
            {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
          </button>
        </div>
      </form>

      <div className="mt-8 flex items-start gap-2.5 rounded-[13px] border border-brand-line bg-brand-soft p-4">
        <IconLock size={16} className="mt-0.5 shrink-0 text-brand" />
        <p className="text-[0.79rem] leading-relaxed text-muted">
          The code expires in 10 minutes and works once. Check your spam folder if it has not
          arrived — and remember that SafePay will never ask you for it by reply, phone, or chat.
        </p>
      </div>
    </AuthLayout>
  );
}
