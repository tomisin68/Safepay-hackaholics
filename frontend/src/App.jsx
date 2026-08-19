import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AppProviders';
import { AppShell } from './components/AppShell';
import { LogoMark } from './brand/Logo';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import Dashboard from './pages/Dashboard';
import Escrows from './pages/Escrows';
import NewEscrow from './pages/NewEscrow';
import EscrowDetail from './pages/EscrowDetail';
import Disputes from './pages/Disputes';
import TrustProfile from './pages/TrustProfile';
import Developer from './pages/Developer';
import Admin from './pages/Admin';
import ClaimCode from './pages/ClaimCode';
import PublicTrust from './pages/PublicTrust';
import NotFound from './pages/NotFound';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={52} className="animate-fade-up" />
        <p className="text-[0.85rem] text-muted">Loading your account…</p>
      </div>
    </div>
  );
}

function Protected({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />;

  return <AppShell>{children}</AppShell>;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trust/:userId" element={<PublicTrust />} />

      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />

      {/* Deliberately NOT wrapped in GuestOnly: the whole point of this screen is
          that the visitor has no session yet, and it is reached from /login as
          well as /signup. It guards itself on the challenge in router state. */}
      <Route path="/verify" element={<VerifyEmail />} />

      <Route path="/app" element={<Protected><Dashboard /></Protected>} />
      <Route path="/app/escrows" element={<Protected><Escrows /></Protected>} />
      <Route path="/app/new" element={<Protected><NewEscrow /></Protected>} />
      <Route path="/app/escrow/:id" element={<Protected><EscrowDetail /></Protected>} />
      <Route path="/app/disputes" element={<Protected><Disputes /></Protected>} />
      <Route path="/app/trust" element={<Protected><TrustProfile /></Protected>} />
      <Route path="/app/developer" element={<Protected><Developer /></Protected>} />
      <Route path="/app/claim" element={<Protected><ClaimCode /></Protected>} />
      <Route path="/app/admin" element={<Protected adminOnly><Admin /></Protected>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
