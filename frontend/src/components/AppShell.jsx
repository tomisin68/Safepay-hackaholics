import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';
import { useAuth, useTheme, useToast } from '../context/AppProviders';
import { Logo, LogoMark } from '../brand/Logo';
import { Avatar, Pill, Toaster } from './ui/Primitives';
import { Button, IconButton } from './ui/Button';
import {
  IconHome, IconWallet, IconScale, IconShieldCheck, IconCode, IconChart,
  IconSun, IconMoon, IconPlus, IconLogout, IconX, IconMenu, IconQr,
} from './Icons';

const NAV = [
  { to: '/app', label: 'Overview', icon: IconHome, end: true },
  { to: '/app/escrows', label: 'Escrows', icon: IconWallet },
  { to: '/app/disputes', label: 'Disputes', icon: IconScale },
  { to: '/app/trust', label: 'Trust profile', icon: IconShieldCheck },
  { to: '/app/developer', label: 'Developers', icon: IconCode },
];

const ADMIN_NAV = { to: '/app/admin', label: 'Operations', icon: IconChart };

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      icon={theme === 'dark' ? IconSun : IconMoon}
      onClick={toggle}
      size="sm"
    />
  );
}

function NavItems({ items, onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[0.89rem] font-medium transition-all duration-200',
              isActive
                ? 'bg-brand-soft text-brand-ink font-semibold'
                : 'text-muted hover:bg-sunken hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={18} className={cn('shrink-0', isActive ? 'text-brand' : 'text-faint group-hover:text-muted')} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }) {
  const { user, score, logout, isAdmin } = useAuth();
  const { toasts, dismiss } = useToast();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  /* Navigating closes the drawer at the source of the click, so there is no
     effect chasing the location after the fact. */
  const closeMenu = () => setMenuOpen(false);

  const items = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  const signOut = () => {
    logout();
    navigate('/');
  };

  const sidebarBody = (
    <>
      <div className="px-3">
        <Button to="/app/new" icon={IconPlus} fullWidth size="md" onClick={closeMenu}>New escrow</Button>
      </div>

      <div className="mt-5 px-3">
        <p className="mb-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.11em] text-faint">Menu</p>
        <NavItems items={items} onNavigate={closeMenu} />
      </div>

      <div className="mt-5 px-3">
        <p className="mb-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.11em] text-faint">Quick actions</p>
        <NavItems items={[{ to: '/app/claim', label: 'Scan / claim code', icon: IconQr }]} onNavigate={closeMenu} />
      </div>

      <div className="mt-auto px-3 pb-3 pt-5">
        <div className="rounded-[12px] border border-line bg-raised p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={user?.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.84rem] font-semibold text-ink">{user?.name}</p>
              <p className="truncate text-[0.72rem] text-muted">{user?.email}</p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <Pill tone={score?.tier === 'trusted' || score?.tier === 'verified_pro' ? 'success' : 'warn'} size="sm" dot={false}>
              SafeScore <span className="tnum ml-0.5">{score?.score ?? user?.safeScore ?? 0}</span>
            </Pill>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[0.75rem] font-semibold text-muted transition-colors hover:bg-sunken hover:text-danger-ink"
            >
              <IconLogout size={14} />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-[68px] items-center justify-between px-5">
          <NavLink to="/app" aria-label="SafePay home">
            <Logo size={32} />
          </NavLink>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-2">{sidebarBody}</div>
      </aside>

      {/* ---------- mobile top bar ---------- */}
      <header className="sticky top-0 z-40 flex h-[60px] items-center justify-between gap-3 border-b border-line bg-surface/92 px-4 backdrop-blur-md lg:hidden">
        <NavLink to="/app" aria-label="SafePay home" onClick={closeMenu} className="flex items-center gap-2">
          <LogoMark size={30} />
          <span className="font-display text-[1.1rem] font-bold tracking-[-0.03em] text-ink">
            Safe<span className="text-brand">Pay</span>
          </span>
        </NavLink>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <IconButton
            label={menuOpen ? 'Close menu' : 'Open menu'}
            icon={menuOpen ? IconX : IconMenu}
            onClick={() => setMenuOpen((o) => !o)}
            size="sm"
          />
        </div>
      </header>

      {/* ---------- mobile drawer ---------- */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-plum/40 backdrop-blur-[2px] animate-fade" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 top-[60px] max-h-[calc(100vh-60px)] overflow-y-auto border-b border-line bg-surface pb-4 pt-4 shadow-[var(--shadow-lg)] animate-fade-up">
            <div className="flex flex-col">{sidebarBody}</div>
          </div>
        </div>
      )}

      {/* ---------- content ---------- */}
      <main className="lg:pl-[264px]">
        <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-6 sm:px-6 lg:pb-16 lg:pt-8">
          {children}
        </div>
      </main>

      {/* ---------- mobile bottom nav (<=5 items) ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Primary"
      >
        {[NAV[0], NAV[1]].map(({ to, label, icon: Icon, end }) => (
          <BottomLink key={to} to={to} label={label} icon={Icon} end={end} />
        ))}

        <NavLink
          to="/app/new"
          aria-label="Create a new escrow"
          className="relative -mt-5 flex flex-1 flex-col items-center justify-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-[var(--shadow-brand)]">
            <IconPlus size={22} />
          </span>
          <span className="mt-0.5 text-[0.62rem] font-semibold text-muted">New</span>
        </NavLink>

        {[NAV[2], NAV[3]].map(({ to, label, icon: Icon }) => (
          <BottomLink key={to} to={to} label={label} icon={Icon} />
        ))}
      </nav>

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function BottomLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.62rem] font-semibold transition-colors',
          isActive ? 'text-brand-ink' : 'text-faint',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className={isActive ? 'text-brand' : ''} />
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Page header used at the top of every in-app screen. */
export function PageHeader({ title, description, action, breadcrumb, className }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
        <h1 className="text-[1.6rem] font-bold text-ink sm:text-[1.85rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[0.92rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
