import { Link } from 'react-router-dom';
import { Logo, LogoMark } from '../brand/Logo';
import { IconArrowLeft, IconShieldCheck, IconLock, IconUsers } from '../components/Icons';

/**
 * Split auth layout: the brand panel carries the reassurance, the form panel
 * stays completely free of decoration so the task is obvious.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* brand panel */}
      <aside className="relative hidden w-[46%] max-w-[560px] overflow-hidden lg:block">
        <div className="brand-gradient absolute inset-0" aria-hidden="true" />
        <div className="grid-texture absolute inset-0" aria-hidden="true" />
        <div
          className="absolute -bottom-24 -left-24 h-[380px] w-[380px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #33CBB0 0%, transparent 70%)' }}
          aria-hidden="true"
        />

        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" aria-label="SafePay home">
            <Logo size={36} onDark />
          </Link>

          <div>
            <h2 className="font-display text-[2.2rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">
              Nobody has to
              <br />
              go first.
            </h2>
            <p className="mt-5 max-w-sm text-[1rem] leading-relaxed text-white/70">
              SafePay holds the money until both sides are happy — and builds a trust score you
              can carry to every other app you use.
            </p>

            <ul className="mt-9 flex flex-col gap-4">
              {[
                [IconShieldCheck, 'Funds held, never released early'],
                [IconUsers, 'A portable trust score for both sides'],
                [IconLock, 'Append-only ledger on every transaction'],
              ].map(([Icon, label]) => (
                <li key={label} className="flex items-center gap-3 text-[0.92rem] text-white/85">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-[#33CBB0]">
                    <Icon size={16} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[0.8rem] text-white/45">
            Built for Hackaholics 7.0 — Wema Bank.
          </p>
        </div>
      </aside>

      {/* form panel */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-5 sm:p-7">
          <Link to="/" className="lg:hidden" aria-label="SafePay home">
            <LogoMark size={34} />
          </Link>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-1.5 text-[0.84rem] font-medium text-muted transition-colors hover:text-ink"
          >
            <IconArrowLeft size={15} />
            Back to site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[400px] animate-fade-up">
            <h1 className="text-[1.75rem] font-bold tracking-[-0.025em] text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-[0.93rem] leading-relaxed text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-7 text-center text-[0.88rem] text-muted">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
