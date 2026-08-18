import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo, LogoMark } from '../brand/Logo';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Primitives';
import { StatusStepper } from '../components/Escrow';
import { ScoreRing } from '../components/Trust';
import { useTheme } from '../context/AppProviders';
import { cn } from '../lib/cn';
import {
  IconShieldCheck, IconWallet, IconCheck, IconArrowRight, IconCode, IconQr, IconScale,
  IconGlobe, IconBank, IconUsers, IconSpark, IconLock, IconSun, IconMoon, IconClock,
} from '../components/Icons';

/* Reveal-on-scroll, and nothing more: motion here is spatial continuity, not
   decoration. Fully disabled under prefers-reduced-motion by the stylesheet. */
function Reveal({ children, delay = 0, className }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); observer.disconnect(); } },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('transition-all duration-700 ease-out', shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, onDark = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.13em]',
        onDark ? 'border-white/20 bg-white/10 text-white/85' : 'border-brand-line bg-brand-soft text-brand-ink',
      )}
    >
      {children}
    </span>
  );
}

export default function Landing() {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* ==================== nav ==================== */}
      <header
        className={cn(
          'sticky top-0 z-50 transition-all duration-300',
          scrolled ? 'border-b border-line bg-canvas/88 backdrop-blur-xl' : 'border-b border-transparent',
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="SafePay home"><Logo size={34} /></Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
            {[
              ['How it works', '#how'],
              ['SafeScore', '#safescore'],
              ['For developers', '#developers'],
              ['Protection', '#protection'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-[0.88rem] font-medium text-muted transition-colors hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="hidden h-10 w-10 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-sunken hover:text-ink sm:inline-flex"
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            <Button to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</Button>
            <Button to="/signup" size="sm" iconRight={IconArrowRight}>Get started</Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ==================== hero ==================== */}
        <section className="relative overflow-hidden">
          <div className="brand-gradient absolute inset-0" aria-hidden="true" />
          <div className="grid-texture absolute inset-0" aria-hidden="true" />
          <div
            className="absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
            style={{ background: 'radial-gradient(circle, #33CBB0 0%, transparent 68%)' }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-[1180px] px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <Reveal>
                  <SectionLabel onDark>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#33CBB0]" />
                    Built for Hackaholics 7.0 · Wema Bank
                  </SectionLabel>
                </Reveal>

                <Reveal delay={80}>
                  <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-white sm:text-[3.4rem] lg:text-[3.9rem]">
                    Pay strangers
                    <br />
                    <span className="text-[#E884D8]">without the fear.</span>
                  </h1>
                </Reveal>

                <Reveal delay={150}>
                  <p className="mt-6 max-w-xl text-[1.06rem] leading-relaxed text-white/78">
                    SafePay holds the money until both sides are happy. Escrow, settlement and a
                    trust score that travels with you — for every WhatsApp sale, campus trade,
                    freelance gig and rent payment in Nigeria.
                  </p>
                </Reveal>

                <Reveal delay={220}>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <Button to="/signup" size="lg" variant="onDark" iconRight={IconArrowRight}>
                      Create your first escrow
                    </Button>
                    <Button href="#how" size="lg" variant="outlineOnDark">
                      See how it works
                    </Button>
                  </div>
                </Reveal>

                <Reveal delay={300}>
                  <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-5 border-t border-white/15 pt-7">
                    {[
                      ['1.5%', 'flat fee, no surprises'],
                      ['5 types', 'goods, services, rent, more'],
                      ['0', 'money lost to a stranger'],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <dt className="numeric text-[1.6rem] font-bold leading-none text-white">{value}</dt>
                        <dd className="mt-1.5 text-[0.8rem] text-white/60">{label}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              </div>

              {/* live product preview */}
              <Reveal delay={260}>
                <HeroPreview />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== the problem ==================== */}
        <section className="border-b border-line bg-raised py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <SectionLabel>The problem</SectionLabel>
                <h2 className="mt-5 text-[1.9rem] font-bold tracking-[-0.025em] text-ink sm:text-[2.3rem]">
                  Somebody always has to go first.
                </h2>
                <p className="mt-4 text-[1rem] leading-relaxed text-muted">
                  The buyer sends money and hopes. Or the seller ships and hopes. Every day, across
                  Instagram, WhatsApp and campus groups, that gamble is the entire payment system.
                </p>
              </div>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { icon: IconWallet, title: 'Money leaves first', body: 'Funds are gone before the goods or service is ever confirmed.' },
                { icon: IconUsers, title: 'Reputation is trapped', body: 'A seller trusted on Instagram starts from zero on every new platform.' },
                { icon: IconScale, title: 'Disputes go nowhere', body: 'No neutral party, no evidence trail, no way to resolve it fairly.' },
              ].map((item, i) => (
                <Reveal key={item.title} delay={i * 90}>
                  <div className="card h-full p-6">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-danger-soft text-danger-ink">
                      <item.icon size={20} />
                    </span>
                    <h3 className="mt-4 text-[1.02rem] font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-[0.89rem] leading-relaxed text-muted">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== how it works ==================== */}
        <section id="how" className="scroll-mt-20 py-18 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <SectionLabel>How it works</SectionLabel>
                <h2 className="mt-5 text-[1.9rem] font-bold tracking-[-0.025em] text-ink sm:text-[2.3rem]">
                  Three steps. Nobody goes first.
                </h2>
                <p className="mt-4 text-[1rem] leading-relaxed text-muted">
                  SafePay stands in the middle and holds the money, so both sides can act with
                  confidence instead of hope.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {[
                {
                  step: '01', icon: IconWallet, title: 'Buyer funds the escrow',
                  body: 'The money leaves the buyer, but it does not reach the seller. SafePay holds it, and both parties can see it is held.',
                },
                {
                  step: '02', icon: IconClock, title: 'Seller delivers',
                  body: 'Goods are shipped, work is done, keys are handed over. The seller knows the money is already there and safe.',
                },
                {
                  step: '03', icon: IconShieldCheck, title: 'Funds are released',
                  body: 'The buyer confirms and the seller is paid instantly — or it auto-releases on a timer, or a dispute freezes it for review.',
                },
              ].map((item, i) => (
                <Reveal key={item.step} delay={i * 110}>
                  <div className="group relative h-full overflow-hidden rounded-[16px] border border-line bg-surface p-7 transition-all duration-300 hover:border-brand/40 hover:shadow-[var(--shadow-lg)]">
                    <span className="numeric absolute right-5 top-4 text-[3.2rem] font-bold leading-none text-brand/8 transition-colors duration-300 group-hover:text-brand/14">
                      {item.step}
                    </span>
                    <span className="relative flex h-12 w-12 items-center justify-center rounded-[13px] bg-brand text-white shadow-[var(--shadow-brand)]">
                      <item.icon size={22} />
                    </span>
                    <h3 className="relative mt-5 text-[1.1rem] font-semibold text-ink">{item.title}</h3>
                    <p className="relative mt-2.5 text-[0.91rem] leading-relaxed text-muted">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* transaction types */}
            <Reveal delay={120}>
              <div className="mt-14 rounded-[18px] border border-line bg-raised p-7 sm:p-9">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-md">
                    <h3 className="text-[1.25rem] font-bold text-ink">Not just for goods.</h3>
                    <p className="mt-2 text-[0.93rem] leading-relaxed text-muted">
                      Most escrow only understands a parcel. SafePay understands how Nigerians
                      actually transact — including milestone work and handing something over in person.
                    </p>
                  </div>
                  <div className="grid flex-1 gap-2.5 sm:grid-cols-2 lg:max-w-lg">
                    {[
                      [IconWallet, 'Goods', 'Phones, laptops, sneakers'],
                      [IconCode, 'Service milestones', 'Pay per stage, not upfront'],
                      [IconBank, 'Rent & deposits', 'Landlords and caution fees'],
                      [IconQr, 'In-person handoff', 'Scan a code at the market'],
                    ].map(([Icon, title, sub]) => (
                      <div key={title} className="flex items-start gap-3 rounded-[12px] border border-line bg-surface p-3.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
                          <Icon size={17} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.87rem] font-semibold text-ink">{title}</p>
                          <p className="text-[0.76rem] text-muted">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ==================== SafeScore ==================== */}
        <section id="safescore" className="scroll-mt-20 border-y border-line bg-raised py-18 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <div className="grid items-center gap-14 lg:grid-cols-2">
              <Reveal>
                <SectionLabel>SafeScore</SectionLabel>
                <h2 className="mt-5 text-[1.9rem] font-bold tracking-[-0.025em] text-ink sm:text-[2.3rem]">
                  Trust you can take with you.
                </h2>
                <p className="mt-4 text-[1rem] leading-relaxed text-muted">
                  Every settled transaction feeds a single 0–100 score, computed from real
                  settlement history — not stars anyone can farm. It is public, portable, and
                  every point is explainable.
                </p>

                <ul className="mt-7 flex flex-col gap-3.5">
                  {[
                    ['Built from settlement history', 'Completed deals, dispute rate, time to confirm, verification tier.'],
                    ['Resistant to gaming', 'Two accounts cycling money between themselves earn volume, not trust.'],
                    ['Portable across every app', 'One public API call returns a seller’s score — anywhere.'],
                    ['Embeddable anywhere', 'A live badge for an Instagram bio link or storefront. No SDK needed.'],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
                        <IconCheck size={12} />
                      </span>
                      <div>
                        <p className="text-[0.92rem] font-semibold text-ink">{title}</p>
                        <p className="text-[0.86rem] leading-relaxed text-muted">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={140}>
                <ScoreShowcase />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== developers ==================== */}
        <section id="developers" className="scroll-mt-20 py-18 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <div className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr]">
              <Reveal>
                <SectionLabel>For developers</SectionLabel>
                <h2 className="mt-5 text-[1.9rem] font-bold tracking-[-0.025em] text-ink sm:text-[2.3rem]">
                  Escrow as three lines of code.
                </h2>
                <p className="mt-4 text-[1rem] leading-relaxed text-muted">
                  SafePay is API-first. Any marketplace, freelance platform or storefront can add
                  buyer protection and a trust layer without building settlement, disputes or
                  reputation from scratch.
                </p>

                <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
                  {[
                    [IconCode, 'REST API + OpenAPI'],
                    [IconLock, 'Signed HMAC webhooks'],
                    [IconSpark, 'Sandbox keys, fake money'],
                    [IconGlobe, 'Public score lookup'],
                  ].map(([Icon, label]) => (
                    <div key={label} className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3.5 py-2.5">
                      <Icon size={16} className="shrink-0 text-brand" />
                      <span className="text-[0.85rem] font-medium text-ink">{label}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-7">
                  <Button to="/signup" iconRight={IconArrowRight}>Get sandbox keys</Button>
                </div>
              </Reveal>

              <Reveal delay={140}>
                <CodeSample />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== protection ==================== */}
        <section id="protection" className="scroll-mt-20 pb-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="relative overflow-hidden rounded-[22px] p-8 sm:p-12">
                <div className="brand-gradient-soft absolute inset-0" aria-hidden="true" />
                <div className="grid-texture absolute inset-0" aria-hidden="true" />

                <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="max-w-xl">
                    <SectionLabel onDark>Buyer Protection Reserve</SectionLabel>
                    <h2 className="mt-5 font-display text-[1.85rem] font-bold tracking-[-0.028em] text-white sm:text-[2.2rem]">
                      A fund that has your back.
                    </h2>
                    <p className="mt-4 text-[1rem] leading-relaxed text-white/75">
                      A slice of every SafePay fee goes into a shared reserve that covers verified
                      edge-case losses. Its balance is visible to everyone — because a protection
                      fund you cannot audit is just a promise.
                    </p>

                    <div className="mt-8 flex flex-wrap gap-3">
                      {[
                        [IconLock, 'Hashed API keys'],
                        [IconShieldCheck, 'Append-only ledger'],
                        [IconScale, 'AI-triaged disputes'],
                      ].map(([Icon, label]) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[0.8rem] font-medium text-white/90"
                        >
                          <Icon size={14} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-white/18 bg-white/10 p-6 backdrop-blur-sm lg:w-[280px]">
                    <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-white/60">
                      Reserve balance
                    </p>
                    <p className="numeric mt-2 text-[2.1rem] font-bold leading-none text-white">₦2.4m</p>
                    <p className="mt-2 text-[0.8rem] text-white/60">funded by 20% of every fee</p>
                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-[68%] rounded-full bg-[#33CBB0]" />
                    </div>
                    <p className="mt-2.5 text-[0.75rem] text-white/55">68% of this quarter&rsquo;s target</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ==================== final CTA ==================== */}
        <section className="border-t border-line bg-raised py-18 sm:py-22">
          <div className="mx-auto max-w-[1180px] px-4 text-center sm:px-6">
            <Reveal>
              <LogoMark size={56} className="mx-auto" />
              <h2 className="mt-6 text-[1.9rem] font-bold tracking-[-0.025em] text-ink sm:text-[2.4rem]">
                Your next deal doesn&rsquo;t have to be a gamble.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-[1rem] leading-relaxed text-muted">
                Create an account, open an escrow, and let SafePay hold the money until everyone
                is happy. It takes about a minute.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button to="/signup" size="lg" iconRight={IconArrowRight}>Get started free</Button>
                <Button to="/login" size="lg" variant="secondary">I already have an account</Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ==================== footer ==================== */}
      <footer className="border-t border-line bg-canvas py-12">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <Logo size={32} showTagline />
              <p className="mt-4 text-[0.84rem] leading-relaxed text-muted">
                A nationwide escrow, settlement and trust-scoring layer for Nigeria.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-6 sm:grid-cols-3">
              {[
                ['Product', [['How it works', '#how'], ['SafeScore', '#safescore'], ['Protection', '#protection']]],
                ['Developers', [['API reference', '/docs'], ['Get started', '/signup'], ['Trust badge', '#safescore']]],
                ['Account', [['Sign in', '/login'], ['Create account', '/signup']]],
              ].map(([heading, links]) => (
                <div key={heading}>
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.11em] text-faint">{heading}</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {links.map(([label, href]) => (
                      <li key={label}>
                        {href.startsWith('/') && !href.startsWith('/docs') ? (
                          <Link to={href} className="text-[0.85rem] text-muted transition-colors hover:text-brand-ink">{label}</Link>
                        ) : (
                          <a href={href} className="text-[0.85rem] text-muted transition-colors hover:text-brand-ink">{label}</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.79rem] text-faint">
              © {new Date().getFullYear()} SafePay. Built for Hackaholics 7.0 — Wema Bank.
            </p>
            <p className="text-[0.79rem] text-faint">
              Settlement rails powered by Wema virtual accounts.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ========================================================================== */

function HeroPreview() {
  const [status, setStatus] = useState('funded');

  useEffect(() => {
    const order = ['created', 'funded', 'in_progress', 'released'];
    let i = 1;
    const timer = setInterval(() => {
      i = (i + 1) % order.length;
      setStatus(order[i]);
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative">
      <div className="absolute -inset-3 rounded-[24px] bg-white/8 blur-xl" aria-hidden="true" />
      <div className="relative rounded-[18px] border border-line bg-surface p-5 shadow-[0_24px_60px_rgba(20,6,19,0.4)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-faint">Escrow</p>
            <p className="mt-1 text-[1.02rem] font-semibold text-ink">iPhone 13 Pro, 256GB</p>
          </div>
          <Pill tone="brand" size="sm">Held by SafePay</Pill>
        </div>

        <div className="mt-5 rounded-[13px] border border-line bg-sunken p-4">
          <p className="text-[0.75rem] text-muted">Amount in escrow</p>
          <p className="numeric mt-1 text-[1.9rem] font-bold leading-none text-ink">₦185,000.00</p>
          <p className="mt-2 text-[0.75rem] text-muted">
            Fee <span className="numeric">₦2,775.00</span> · seller receives <span className="numeric">₦182,225.00</span>
          </p>
        </div>

        <div className="mt-6">
          <StatusStepper status={status} compact />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[0.72rem] font-bold text-brand-ink">
              TB
            </span>
            <div>
              <p className="text-[0.82rem] font-semibold text-ink">Tunde Bakare</p>
              <p className="text-[0.7rem] text-muted">Seller</p>
            </div>
          </div>
          <Pill tone="success" size="sm" icon={IconShieldCheck}>
            SafeScore <span className="tnum">68</span>
          </Pill>
        </div>
      </div>
    </div>
  );
}

function ScoreShowcase() {
  return (
    <div className="card p-7">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <ScoreRing score={68} tier="trusted" size={124} />

        <div className="min-w-0 flex-1">
          <p className="text-[1.05rem] font-semibold text-ink">Tunde Bakare</p>
          <p className="text-[0.82rem] text-muted">Member since 2026 · BVN verified</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {[
              ['Completed', '4'],
              ['Dispute rate', '0%'],
              ['Counterparties', '4'],
              ['Median release', '31h'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[0.72rem] font-medium text-faint">{label}</dt>
                <dd className="numeric text-[0.95rem] font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-6 rounded-[12px] border border-line bg-sunken p-4">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-faint">Embed anywhere</p>
        <code className="mt-2.5 block overflow-x-auto whitespace-nowrap rounded-[8px] bg-surface px-3 py-2 text-[0.74rem] text-brand-ink numeric">
          {'<img src="safepay.ng/v1/score/:id/badge.svg">'}
        </code>
        <p className="mt-2.5 text-[0.78rem] leading-relaxed text-muted">
          One image tag. Works in an Instagram bio link, a storefront, or any website — no SDK,
          no JavaScript.
        </p>
      </div>
    </div>
  );
}

function CodeSample() {
  const [tab, setTab] = useState('node');

  const samples = {
    node: `const res = await fetch("https://api.safepay.ng/v1/escrows", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.SAFEPAY_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "goods",
    amount: 185000,
    title: "iPhone 13 Pro, 256GB",
    sellerEmail: "seller@example.com",
  }),
});

const { escrow } = await res.json();
// escrow.status === "created"`,
    react: `import { SafePayButton, TrustBadge } from "@safepay/react";

export function Checkout({ listing }) {
  return (
    <>
      <TrustBadge userId={listing.sellerId} />

      <SafePayButton
        amount={listing.price}
        title={listing.name}
        sellerId={listing.sellerId}
        onReleased={(escrow) => confirmOrder(escrow.id)}
      >
        Pay safely with SafePay
      </SafePayButton>
    </>
  );
}`,
    curl: `curl https://api.safepay.ng/v1/escrows \\
  -H "Authorization: Bearer sk_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "service_milestone",
    "amount": 450000,
    "title": "Brand website build",
    "milestones": [
      { "title": "Design",   "amount": 150000 },
      { "title": "Build",    "amount": 200000 },
      { "title": "Handover", "amount": 100000 }
    ]
  }'`,
  };

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-plum shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2.5">
        <span className="mr-2 flex gap-1.5 pl-1.5" aria-hidden="true">
          {['#E8323E', '#E0921F', '#33CBB0'].map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.65 }} />
          ))}
        </span>
        {[['node', 'Node.js'], ['react', 'React'], ['curl', 'cURL']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded-[8px] px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
              tab === key ? 'bg-white/14 text-white' : 'text-white/45 hover:text-white/75',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <pre className="overflow-x-auto p-5 text-[0.78rem] leading-relaxed text-white/85">
        <code className="numeric">{samples[tab]}</code>
      </pre>
    </div>
  );
}
