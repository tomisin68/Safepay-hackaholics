import { Link } from 'react-router-dom';
import { LogoMark } from '../brand/Logo';
import { Button } from '../components/ui/Button';
import { IconArrowLeft } from '../components/Icons';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 text-center">
      <LogoMark size={56} />
      <p className="numeric mt-8 text-[3.5rem] font-bold leading-none text-brand/25">404</p>
      <h1 className="mt-3 text-[1.6rem] font-bold text-ink">This page has gone missing</h1>
      <p className="mt-2.5 max-w-sm text-[0.93rem] leading-relaxed text-muted">
        Your money has not. Nothing here affects any escrow you have open.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button to="/app" icon={IconArrowLeft}>Back to dashboard</Button>
        <Button to="/" variant="secondary">Go to homepage</Button>
      </div>
      <Link to="/login" className="mt-6 text-[0.85rem] text-muted hover:text-brand-ink">
        Not signed in? Sign in here
      </Link>
    </div>
  );
}
