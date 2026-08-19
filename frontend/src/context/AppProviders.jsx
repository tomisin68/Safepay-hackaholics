import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

/* ==========================================================================
   Theme
   ========================================================================== */
const ThemeContext = createContext(null);
const THEME_KEY = 'safepay.theme';

function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme: setThemeState, toggle: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/* ==========================================================================
   Toasts — every mutation gets an outcome the user can see.
   ========================================================================== */
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = nextId.current++;
    const entry = { id, tone: 'success', duration: 4500, ...toast };
    setToasts((list) => [...list, entry]);
    if (entry.duration) setTimeout(() => dismiss(id), entry.duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    toasts,
    dismiss,
    success: (title, description) => push({ tone: 'success', title, description }),
    error: (title, description) => push({ tone: 'danger', title, description, duration: 7000 }),
    info: (title, description) => push({ tone: 'brand', title, description }),
  }), [toasts, push, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);

/* ==========================================================================
   Auth
   ========================================================================== */
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setScore(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await api.auth.me();
      setUser(data.user);
      setScore(data.score);
      return data.user;
    } catch {
      setUser(null);
      setScore(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Adopts a `{ token, user }` response as the live session.
   *
   * `refresh()` afterwards is not redundant: the login response carries the user
   * but not the SafeScore, and every screen behind the shell expects both.
   */
  const adopt = useCallback(async (data) => {
    setToken(data.token);
    setUser(data.user);
    await refresh();
    return { status: 'signed_in', user: data.user };
  }, [refresh]);

  /**
   * Signup, login, and code verification all resolve to one of two shapes:
   *
   *   { status: 'signed_in',   user }
   *   { status: 'verify',      challengeId, email, expiresInMinutes }
   *
   * Callers switch on `status` rather than guessing from what happens to be
   * present. Errors still throw — a discriminated result is for the two *valid*
   * outcomes, not for failure.
   */
  const login = useCallback(async (credentials) => {
    const data = await api.auth.login(credentials);
    if (data?.verificationRequired) {
      return {
        status: 'verify',
        challengeId: data.challengeId,
        email: data.email,
        expiresInMinutes: data.expiresInMinutes,
      };
    }
    return adopt(data);
  }, [adopt]);

  /** Always returns `status: 'verify'` — the API issues no token at signup. */
  const signup = useCallback(async (payload) => {
    const data = await api.auth.signup(payload);
    return {
      status: 'verify',
      challengeId: data.challengeId,
      email: data.email,
      expiresInMinutes: data.expiresInMinutes,
    };
  }, []);

  /** Trades a correct emailed code for a session. */
  const verifyEmail = useCallback(async ({ challengeId, code }) => {
    const data = await api.auth.verifyEmail({ challengeId, code });
    return adopt(data);
  }, [adopt]);

  const resendCode = useCallback((challengeId) => api.auth.resendCode(challengeId), []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setScore(null);
  }, []);

  const value = useMemo(
    () => ({
      user, score, loading,
      login, signup, verifyEmail, resendCode, logout, refresh,
      isAdmin: user?.role === 'admin',
    }),
    [user, score, loading, login, signup, verifyEmail, resendCode, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/* ========================================================================== */
export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
