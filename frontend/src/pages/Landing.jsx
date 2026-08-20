import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo, LogoMark } from '../brand/Logo';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Primitives';
import { StatusStepper } from '../components/Escrow';
import { ScoreRing } from '../components/Trust';
import { SecurePaymentLottie } from '../components/SecurePaymentLottie';
import { SceneChatSale, SceneMarketHandoff, SceneMilestones } from '../components/Illustrations';
import { useTheme } from '../context/AppProviders';
import { isDemoMode } from '../lib/api';
import { cn } from '../lib/cn';
import {
  IconShieldCheck, IconWallet, IconCheck, IconArrowRight, IconCode, IconQr, IconScale,
  IconGlobe, IconBank, IconUsers, IconSpark, IconLock, IconSun, IconMoon, IconClock,
  IconMenu, IconX, IconCamera,
} from '../components/Icons';

/**
 * The logo walls.
 *
 * `Trusted by` is the marketplaces and platforms SafePay's users are already
 * trading on — the places a Nigerian buyer meets a stranger and has to decide
 * whether to go first. `Backed by` is Wema and ALAT, the bank this was built
 * with and on. Both files live in /public and are drawn on a white tile so a
 * dark brandmark stays legible in either theme.
 */
const TRUSTED_BY = [
  ['Wema Bank', '/wema-removebg-preview.png'],
  ['ALAT by Wema', '/alat-removebg-preview.png'],
  ['Jumia', '/Jumia-Logo-removebg-preview.png'],
  ['Konga', '/konga-removebg-preview.png'],
  ['Jiji', '/jiji-removebg-preview.png'],
  ['eBay', '/ebay-removebg-preview.png'],
  ['Alibaba', '/alibaba-removebg-preview.png'],
  ['Shopify', '/shoppify-removebg-preview.png'],
  ['Upwork', '/upwork-removebg-preview.png'],
  ['Fiverr', '/fiverr-removebg-preview.png'],
];

const BACKED_BY = [
  ['Wema Bank', '/wema-removebg-preview.png', 'Settlement rails and virtual accounts'],
  ['ALAT by Wema', '/alat-removebg-preview.png', 'Nigeria’s first fully digital bank'],
];

const NAV_LINKS = [
  ['How it works', '#how'],
  ['SafeScore', '#safescore'],
  ['For developers', '#developers'],
  ['Protection', '#protection'],
];

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
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.13em] sm:text-[0.72rem]',
        onDark ? 'border-white/20 bg-white/10 text-white/85' : 'border-brand-line bg-brand-soft text-brand-ink',
      )}
    >
      {children}
    </span>
  );
}

/* Headings are fluid rather than stepped: a 2.3rem heading does not fit a
   320px phone, and a breakpoint jump between the two sizes is visible. */
const H1 = 'text-[clamp(2.05rem,8.4vw,3.9rem)] leading-[1.06] tracking-[-0.035em]';
const H2 = 'text-[clamp(1.6rem,5.2vw,2.3rem)] leading-[1.12] tracking-[-0.025em]';

export default function Landing() {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* An open sheet must not leave the page scrolling underneath it, and Escape
     has to close it — a menu you can only dismiss by tapping exactly the right
     pixel is a trap on a phone. */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {isDemoMode && <DemoBanner />}

      {/* ==================== nav ==================== */}
      <header
        className={cn(
          'sticky top-0 z-50 transition-all duration-300',
          scrolled || menuOpen ? 'border-b border-line bg-canvas/88 backdrop-blur-xl' : 'border-b border-transparent',
        )}
      >
        {/* Below md the bar carries only the logo, the theme toggle and the
            menu button. Squeezing the CTAs in as well overflows a 360px phone,
            and the clipped overflow makes the menu button unreachable rather
            than merely ugly — so the CTAs move into the sheet instead. */}
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-3 px-4 sm:h-[72px] sm:gap-6 sm:px-6">
          <Link to="/" aria-label="SafePay home" className="shrink-0">
            <Logo size={32} />
          </Link>

          <nav className="hidden items-center gap-6 md:flex lg:gap-7" aria-label="Main">
            {NAV_LINKS.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="flex min-h-[44px] items-center text-[0.88rem] font-medium text-muted transition-colors hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>

            {/* Wrapped rather than given `hidden` directly: `cn` is a plain
                string joiner, so a `hidden` passed to Button lands alongside
                Button's own `inline-flex` and loses to it on source order —
                the CTAs would stay visible on mobile and push the menu button
                off the bar. Hiding a neutral wrapper has nothing to conflict with. */}
            <span className="hidden items-center gap-2 md:flex">
              <Button to="/login" variant="ghost" size="sm">Sign in</Button>
              <Button to="/signup" size="sm" iconRight={IconArrowRight}>Get started</Button>
            </span>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-sunken hover:text-ink md:hidden"
            >
              {menuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile sheet. Below md the nav links and both CTAs have nowhere else
            to live, and without this the whole site map is unreachable. */}
        <div
          id="mobile-menu"
          className={cn(
            'overflow-hidden border-t border-line bg-canvas transition-[max-height,opacity] duration-300 ease-out md:hidden',
            menuOpen ? 'max-h-[460px] opacity-100' : 'pointer-events-none max-h-0 opacity-0',
          )}
        >
          <nav className="mx-auto flex max-w-[1180px] flex-col gap-1 px-4 py-3" aria-label="Mobile">
            {NAV_LINKS.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[48px] items-center rounded-[11px] px-3 text-[0.95rem] font-medium text-ink transition-colors hover:bg-sunken"
              >
                {label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              <Button to="/signup" size="md" fullWidth iconRight={IconArrowRight} onClick={() => setMenuOpen(false)}>
                Get started
              </Button>
              <Button to="/login" size="md" variant="secondary" fullWidth onClick={() => setMenuOpen(false)}>
                Sign in
              </Button>
            </div>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ==================== hero ==================== */}
        <section className="relative overflow-hidden">
          <div className="brand-gradient absolute inset-0" aria-hidden="true" />
          <div className="grid-texture absolute inset-0" aria-hidden="true" />
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-[280px] w-[280px] rounded-full opacity-25 blur-3xl sm:-right-32 sm:-top-32 sm:h-[420px] sm:w-[420px]"
            style={{ background: 'radial-gradient(circle,#33CBB0 0%,transparent 68%)' }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-[1180px] px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
            <div className="grid items-center gap-10 sm:gap-14 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="min-w-0">
                <Reveal>
                  <SectionLabel onDark>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#33CBB0]" />
                    <span className="truncate">Built for Hackaholics 7.0 · Wema Bank</span>
                  </SectionLabel>
                </Reveal>

                <Reveal delay={80}>
                  <h1 className={cn('mt-5 font-display font-extrabold text-white sm:mt-6', H1)}>
                    Pay strangers
                    <br />
                    <span className="text-[#E884D8]">without the fear.</span>
                  </h1>
                </Reveal>

                <Reveal delay={150}>
                  <p className="mt-5 max-w-xl text-[1rem] leading-relaxed text-white/78 sm:mt-6 sm:text-[1.06rem]">
                    SafePay holds the money until both sides are happy. Escrow, settlement and a
                    trust score that travels with you — for every WhatsApp sale, campus trade,
                    freelance gig and rent payment in Nigeria.
                  </p>
                </Reveal>

                <Reveal delay={220}>
                  <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row">
                    <Button to="/signup" size="lg" variant="onDark" iconRight={IconArrowRight}>
                      Create your first escrow
                    </Button>
                    <Button href="#how" size="lg" variant="outlineOnDark">
                      See how it works
                    </Button>
                  </div>
                </Reveal>

                <Reveal delay={300}>
                  {/* A three-column grid rather than a wrapping flex row: wrapping
                      strands one statistic on its own line at most phone widths. */}
                  <dl className="mt-10 grid grid-cols-3 gap-x-4 gap-y-5 border-t border-white/15 pt-6 sm:mt-12 sm:gap-x-10 sm:pt-7">
                    {[
                      ['1.5%', 'flat fee, no surprises'],
                      ['5 types', 'goods, services, rent, more'],
                      ['0', 'money lost to a stranger'],
                    ].map(([value, label]) => (
                      <div key={label} className="min-w-0">
                        <dt className="numeric text-[clamp(1.15rem,4.4vw,1.6rem)] font-bold leading-none text-white">
                          {value}
                        </dt>
                        <dd className="mt-1.5 text-[0.72rem] leading-snug text-white/60 sm:text-[0.8rem]">{label}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              </div>

              {/* live product preview */}
              <Reveal delay={260} className="min-w-0">
                <HeroPreview />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== trusted by ==================== */}
        <section className="border-b border-line bg-canvas py-12 sm:py-16">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="text-center">
                <SectionLabel>Trusted by</SectionLabel>
                <h2 className="mt-4 text-[1.15rem] font-semibold leading-snug text-ink sm:text-[1.3rem]">
                  Built for the places Nigerians already buy and sell.
                </h2>
                <p className="mx-auto mt-2.5 max-w-lg text-[0.88rem] leading-relaxed text-muted">
                  Every one of these is somewhere you end up paying a stranger. SafePay is the
                  hold that sits between you and them.
                </p>
              </div>
            </Reveal>

            {/* A grid rather than a marquee: a logo that slides past is a logo
                nobody reads, and on a phone it becomes a horizontal scroll trap. */}
            <Reveal delay={100}>
              <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                {TRUSTED_BY.map(([name, src], i) => (
                  <li
                    key={name}
                    className="flex h-[80px] items-center justify-center rounded-[12px] border border-line bg-white px-5 py-4 transition-transform duration-200 hover:-translate-y-0.5 sm:h-[92px]"
                    style={{ transitionDelay: `${i * 30}ms` }}
                  >
                    {/* Fixed box + object-contain rather than a max-height cap:
                        these marks range from square to 3:1, and several have
                        generous transparent padding baked into the file. Letting
                        each fill the same box is what stops Konga from looking
                        like a footnote next to eBay. */}
                    <img
                      src={src}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ==================== backed by ==================== */}
        <section className="border-b border-line bg-raised py-12 sm:py-16">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="text-center">
                <SectionLabel>Backed by</SectionLabel>
                <h2 className="mt-4 text-[1.15rem] font-semibold leading-snug text-ink sm:text-[1.3rem]">
                  Built on Wema Bank rails, for Hackaholics 7.0.
                </h2>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <ul className="mx-auto mt-8 grid max-w-2xl gap-4 sm:mt-10 sm:grid-cols-2">
                {BACKED_BY.map(([name, src, blurb]) => (
                  <li
                    key={name}
                    className="flex flex-col items-center gap-4 rounded-[16px] border border-line bg-surface p-6 text-center"
                  >
                    <span className="flex h-[104px] w-full items-center justify-center rounded-[12px] bg-white px-6 py-5">
                      <img
                        src={src}
                        alt={name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain"
                      />
                    </span>
                    <div>
                      <p className="text-[0.95rem] font-semibold text-ink">{name}</p>
                      <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{blurb}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ==================== how the hold works ==================== */}
        <section className="border-b border-line bg-canvas py-14 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <div className="grid items-center gap-8 sm:gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <Reveal className="order-2 min-w-0 lg:order-1">
                <div className="relative mx-auto w-full max-w-[340px] lg:max-w-none">
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full opacity-70 blur-3xl"
                    style={{ background: 'radial-gradient(circle,var(--c-brand-soft) 0%,transparent 70%)' }}
                    aria-hidden="true"
                  />
                  <div className="relative aspect-square overflow-hidden rounded-[24px] border border-brand-line bg-brand-soft/40">
                    {/* The artwork occupies about half its 500x500 canvas, so it
                        is scaled up to fill the panel rather than floating in it. */}
                    <SecurePaymentLottie className="scale-[1.15]" />
                  </div>
                </div>
              </Reveal>

              <Reveal delay={120} className="order-1 min-w-0 lg:order-2">
                <SectionLabel>The hold</SectionLabel>
                <h2 className={cn('mt-4 font-bold text-ink sm:mt-5', H2)}>
                  The money stops moving the moment it matters.
                </h2>
                <p className="mt-4 text-[0.98rem] leading-relaxed text-muted sm:text-[1rem]">
                  When a buyer funds an escrow, the money leaves their account and stops. The seller
                  can see it is there. Neither of them can touch it. That single pause is the whole
                  product — everything else exists to end the pause fairly.
                </p>

                <ul className="mt-6 grid gap-3 sm:mt-7 sm:grid-cols-2">
                  {[
                    [IconLock, 'Locked on funding', 'Out of the buyer’s hands, not yet in the seller’s.'],
                    [IconCheck, 'Released on confirmation', 'One tap from the buyer pays the seller instantly.'],
                    [IconCamera, 'Proof on delivery', 'The seller photographs the handover, so a dispute has evidence.'],
                    [IconScale, 'Frozen on dispute', 'Nothing moves until a neutral party has looked.'],
                  ].map(([Icon, title, body]) => (
                    <li key={title} className="flex gap-3 rounded-[13px] border border-line bg-surface p-3.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.88rem] font-semibold text-ink">{title}</p>
                        <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== the problem ==================== */}
        <section className="border-b border-line bg-raised py-14 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <SectionLabel>The problem</SectionLabel>
                <h2 className={cn('mt-5 font-bold text-ink', H2)}>
                  Somebody always has to go first.
                </h2>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-muted sm:text-[1rem]">
                  The buyer sends money and hopes. Or the seller ships and hopes. Every day, across
                  Instagram, WhatsApp and campus groups, that gamble is the entire payment system.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
              {[
                { icon: IconWallet, title: 'Money leaves first', body: 'Funds are gone before the goods or service is ever confirmed.' },
                { icon: IconUsers, title: 'Reputation is trapped', body: 'A seller trusted on Instagram starts from zero on every new platform.' },
                { icon: IconScale, title: 'Disputes go nowhere', body: 'No neutral party, no evidence trail, no way to resolve it fairly.' },
              ].map((item, i) => (
                <Reveal key={item.title} delay={i * 90}>
                  <div className="card h-full p-5 sm:p-6">
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
        <section id="how" className="scroll-mt-20 py-14 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <SectionLabel>How it works</SectionLabel>
                <h2 className={cn('mt-5 font-bold text-ink', H2)}>
                  Three steps. Nobody goes first.
                </h2>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-muted sm:text-[1rem]">
                  SafePay stands in the middle and holds the money, so both sides can act with
                  confidence instead of hope.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid gap-5 sm:mt-14 sm:gap-6 md:grid-cols-3">
              {[
                {
                  step: '01', icon: IconWallet, title: 'Buyer funds the escrow',
                  body: 'The money leaves the buyer, but it does not reach the seller. SafePay holds it, and both parties can see it is held.',
                },
                {
                  step: '02', icon: IconCamera, title: 'Seller delivers, with proof',
                  body: 'Goods are shipped, work is done, keys are handed over — and the seller uploads a photo of it. The money is already there and safe.',
                },
                {
                  step: '03', icon: IconShieldCheck, title: 'Funds are released',
                  body: 'The buyer confirms and the seller is paid instantly. If something is wrong instead, a dispute freezes the money until a reviewer decides.',
                },
              ].map((item, i) => (
                <Reveal key={item.step} delay={i * 110}>
                  <div className="group relative h-full overflow-hidden rounded-[16px] border border-line bg-surface p-5 transition-all duration-300 hover:border-brand/40 hover:shadow-[var(--shadow-lg)] sm:p-7">
                    <span className="numeric absolute right-4 top-3 text-[2.6rem] font-bold leading-none text-brand/8 transition-colors duration-300 group-hover:text-brand/14 sm:right-5 sm:top-4 sm:text-[3.2rem]">
                      {item.step}
                    </span>
                    <span className="relative flex h-12 w-12 items-center justify-center rounded-[13px] bg-brand text-white shadow-[var(--shadow-brand)]">
                      <item.icon size={22} />
                    </span>
                    <h3 className="relative mt-4 text-[1.06rem] font-semibold text-ink sm:mt-5 sm:text-[1.1rem]">{item.title}</h3>
                    <p className="relative mt-2.5 text-[0.89rem] leading-relaxed text-muted sm:text-[0.91rem]">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== what people actually trade ==================== */}
        <section className="border-y border-line bg-raised py-14 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <SectionLabel>Not just for goods</SectionLabel>
                <h2 className={cn('mt-5 font-bold text-ink', H2)}>
                  Built for how Nigeria actually trades.
                </h2>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-muted sm:text-[1rem]">
                  Most escrow only understands a parcel with a tracking number. SafePay understands
                  the deal that starts in a DM, the handover at the market, and the job that gets
                  paid in stages.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid gap-5 sm:mt-14 sm:gap-6 md:grid-cols-3">
              {[
                {
                  Scene: SceneChatSale,
                  title: 'The deal that starts in a DM',
                  body: 'Someone posts a phone on WhatsApp status. Instead of "send the money first", both sides open an escrow in the chat.',
                },
                {
                  Scene: SceneMarketHandoff,
                  title: 'The handover in person',
                  body: 'Meeting at Balogun or Computer Village? The seller shows a code, the buyer scans it, and the money only moves once.',
                },
                {
                  Scene: SceneMilestones,
                  title: 'The job paid in stages',
                  body: 'Design, build, handover. Each stage releases its own slice, so neither the freelancer nor the client carries all the risk.',
                },
              ].map(({ Scene, title, body }, i) => (
                <Reveal key={title} delay={i * 100}>
                  <div className="group flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface transition-all duration-300 hover:border-brand/40 hover:shadow-[var(--shadow-lg)]">
                    <div className="p-3 pb-0 sm:p-4 sm:pb-0">
                      <Scene className="rounded-[12px]" />
                    </div>
                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <h3 className="text-[1.02rem] font-semibold text-ink">{title}</h3>
                      <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">{body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={120}>
              <div className="mt-8 flex flex-wrap justify-center gap-2 sm:mt-10 sm:gap-2.5">
                {[
                  [IconWallet, 'Goods'],
                  [IconCode, 'Service milestones'],
                  [IconBank, 'Rent & deposits'],
                  [IconQr, 'In-person handoff'],
                  [IconClock, 'Recurring'],
                ].map(([Icon, label]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[0.82rem] font-medium text-ink"
                  >
                    <Icon size={15} className="shrink-0 text-brand" />
                    {label}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ==================== SafeScore ==================== */}
        <section id="safescore" className="scroll-mt-20 py-14 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <div className="grid items-center gap-10 sm:gap-14 lg:grid-cols-2">
              <Reveal className="min-w-0">
                <SectionLabel>SafeScore</SectionLabel>
                <h2 className={cn('mt-5 font-bold text-ink', H2)}>
                  Trust you can take with you.
                </h2>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-muted sm:text-[1rem]">
                  Every settled transaction feeds a single 0–100 score, computed from real
                  settlement history — not stars anyone can farm. It is public, portable, and
                  every point is explainable.
                </p>

                <ul className="mt-6 flex flex-col gap-3.5 sm:mt-7">
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
                      <div className="min-w-0">
                        <p className="text-[0.92rem] font-semibold text-ink">{title}</p>
                        <p className="text-[0.86rem] leading-relaxed text-muted">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={140} className="min-w-0">
                <ScoreShowcase />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== developers ==================== */}
        <section id="developers" className="scroll-mt-20 border-t border-line py-14 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <div className="grid items-center gap-10 sm:gap-14 lg:grid-cols-[0.95fr_1.05fr]">
              <Reveal className="min-w-0">
                <SectionLabel>For developers</SectionLabel>
                <h2 className={cn('mt-5 font-bold text-ink', H2)}>
                  Escrow as three lines of code.
                </h2>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-muted sm:text-[1rem]">
                  SafePay is API-first. Any marketplace, freelance platform or storefront can add
                  buyer protection and a trust layer without building settlement, disputes or
                  reputation from scratch.
                </p>

                <div className="mt-6 grid gap-2.5 sm:mt-7 sm:grid-cols-2">
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

                <div className="mt-6 sm:mt-7">
                  <Button to="/signup" iconRight={IconArrowRight}>Get sandbox keys</Button>
                </div>
              </Reveal>

              {/* min-w-0 is load-bearing: without it the code block's longest
                  line sets the grid track width and the whole page scrolls
                  sideways on a phone. */}
              <Reveal delay={140} className="min-w-0">
                <CodeSample />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ==================== protection ==================== */}
        <section id="protection" className="scroll-mt-20 pb-16 sm:pb-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
            <Reveal>
              <div className="relative overflow-hidden rounded-[20px] p-6 sm:rounded-[22px] sm:p-12">
                <div className="brand-gradient-soft absolute inset-0" aria-hidden="true" />
                <div className="grid-texture absolute inset-0" aria-hidden="true" />

                <div className="relative grid gap-8 sm:gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0 max-w-xl">
                    <SectionLabel onDark>Buyer Protection Reserve</SectionLabel>
                    <h2 className={cn('mt-5 font-display font-bold text-white', H2)}>
                      A fund that has your back.
                    </h2>
                    <p className="mt-4 text-[0.95rem] leading-relaxed text-white/75 sm:text-[1rem]">
                      A slice of every SafePay fee goes into a shared reserve that covers verified
                      edge-case losses. Its balance is visible to everyone — because a protection
                      fund you cannot audit is just a promise.
                    </p>

                    <div className="mt-7 flex flex-wrap gap-2 sm:mt-8 sm:gap-3">
                      {[
                        [IconLock, 'Hashed API keys'],
                        [IconShieldCheck, 'Append-only ledger'],
                        [IconScale, 'AI-triaged disputes'],
                      ].map(([Icon, label]) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.76rem] font-medium text-white/90 sm:px-3.5 sm:text-[0.8rem]"
                        >
                          <Icon size={14} className="shrink-0" />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-white/18 bg-white/10 p-5 backdrop-blur-sm sm:p-6 lg:w-[280px]">
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-white/60 sm:text-[0.75rem]">
                      Reserve balance
                    </p>
                    <p className="numeric mt-2 text-[1.9rem] font-bold leading-none text-white sm:text-[2.1rem]">₦2.4m</p>
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
        <section className="border-t border-line bg-raised py-14 sm:py-22">
          <div className="mx-auto max-w-[1180px] px-4 text-center sm:px-6">
            <Reveal>
              <LogoMark size={56} className="mx-auto" />
              <h2 className={cn('mt-6 font-bold text-ink', H2)}>
                Your next deal doesn&rsquo;t have to be a gamble.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-[0.95rem] leading-relaxed text-muted sm:text-[1rem]">
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
      <footer className="border-t border-line bg-canvas py-10 sm:py-12">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <Logo size={32} showTagline />
              <p className="mt-4 text-[0.84rem] leading-relaxed text-muted">
                A nationwide escrow, settlement and trust-scoring layer for Nigeria.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 sm:gap-x-12 sm:gap-y-6">
              {[
                ['Product', [['How it works', '#how'], ['SafeScore', '#safescore'], ['Protection', '#protection']]],
                ['Developers', [['API reference', '/docs'], ['Get started', '/signup'], ['Trust badge', '#safescore']]],
                ['Account', [['Sign in', '/login'], ['Create account', '/signup']]],
              ].map(([heading, links]) => (
                <div key={heading}>
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.11em] text-faint">{heading}</p>
                  {/* inline-flex + min-height so a footer link is a thumb-sized
                      target on a phone, not a 16px line of text. */}
                  <ul className="mt-1.5 flex flex-col">
                    {links.map(([label, href]) => {
                      const style = 'inline-flex min-h-[40px] items-center text-[0.85rem] text-muted transition-colors hover:text-brand-ink';
                      return (
                        <li key={label} className="flex">
                          {href.startsWith('/') && !href.startsWith('/docs') ? (
                            <Link to={href} className={style}>{label}</Link>
                          ) : (
                            <a href={href} className={style}>{label}</a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-9 flex flex-col gap-2 border-t border-line pt-6 sm:mt-10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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

/** Says plainly that this build has no API behind it, before anyone tries. */
function DemoBanner() {
  return (
    <div className="brand-gradient-soft relative z-50 px-4 py-2 text-center">
      <p className="text-[0.78rem] leading-snug text-white/90">
        <span className="font-semibold">Live demo</span> — runs on seeded data in your browser.
        Sign in with <span className="numeric">ada@safepay.test</span> /{' '}
        <span className="numeric">password123</span>.
      </p>
    </div>
  );
}

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
      <div className="relative rounded-[18px] border border-line bg-surface p-4 shadow-[0_24px_60px_rgba(20,6,19,0.4)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-faint">Escrow</p>
            <p className="mt-1 truncate text-[0.98rem] font-semibold text-ink sm:text-[1.02rem]">iPhone 13 Pro, 256GB</p>
          </div>
          <Pill tone="brand" size="sm" className="shrink-0">Held</Pill>
        </div>

        <div className="mt-4 rounded-[13px] border border-line bg-sunken p-3.5 sm:mt-5 sm:p-4">
          <p className="text-[0.75rem] text-muted">Amount in escrow</p>
          <p className="numeric mt-1 text-[clamp(1.5rem,6vw,1.9rem)] font-bold leading-none text-ink">₦185,000.00</p>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted sm:text-[0.75rem]">
            Fee <span className="numeric">₦2,775.00</span> · seller receives <span className="numeric">₦182,225.00</span>
          </p>
        </div>

        <div className="mt-5 sm:mt-6">
          <StatusStepper status={status} compact />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 sm:mt-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[0.72rem] font-bold text-brand-ink">
              TB
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.82rem] font-semibold text-ink">Tunde Bakare</p>
              <p className="text-[0.7rem] text-muted">Seller</p>
            </div>
          </div>
          <Pill tone="success" size="sm" icon={IconShieldCheck} className="shrink-0">
            SafeScore <span className="tnum">68</span>
          </Pill>
        </div>
      </div>
    </div>
  );
}

function ScoreShowcase() {
  return (
    <div className="card p-5 sm:p-7">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
        <ScoreRing score={68} tier="trusted" size={124} />

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[1.05rem] font-semibold text-ink">Tunde Bakare</p>
          <p className="text-[0.82rem] text-muted">Member since 2026 · BVN verified</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-left">
            {[
              ['Completed', '4'],
              ['Dispute rate', '0%'],
              ['Counterparties', '4'],
              ['Median release', '31h'],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[0.72rem] font-medium text-faint">{label}</dt>
                <dd className="numeric text-[0.95rem] font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-6 min-w-0 rounded-[12px] border border-line bg-sunken p-4">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.11em] text-faint">Embed anywhere</p>
        <code className="numeric mt-2.5 block overflow-x-auto whitespace-nowrap rounded-[8px] bg-surface px-3 py-2 text-[0.7rem] text-brand-ink sm:text-[0.74rem]">
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
    <div className="min-w-0 overflow-hidden rounded-[16px] border border-line bg-plum shadow-[var(--shadow-lg)]">
      {/* The tab strip scrolls rather than wraps: a wrapped strip changes the
          panel height between tabs and shifts the code underneath it. */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-2.5 sm:px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="mr-1 hidden shrink-0 gap-1.5 pl-1.5 sm:flex" aria-hidden="true">
          {['#E8323E', '#E0921F', '#33CBB0'].map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.65 }} />
          ))}
        </span>
        {[['node', 'Node.js'], ['react', 'React'], ['curl', 'cURL']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              'flex h-9 shrink-0 items-center rounded-[8px] px-3 text-[0.78rem] font-semibold transition-colors',
              tab === key ? 'bg-white/14 text-white' : 'text-white/45 hover:text-white/75',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <pre className="overflow-x-auto p-4 text-[0.72rem] leading-relaxed text-white/85 sm:p-5 sm:text-[0.78rem]">
        <code className="numeric">{samples[tab]}</code>
      </pre>
    </div>
  );
}
