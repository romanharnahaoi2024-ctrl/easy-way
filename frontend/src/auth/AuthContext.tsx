import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchMe, login as apiLogin } from '../api/auth';
import { setAuthToken } from '../api/http';
import type { LoginPayload, User } from '../api/types';
import { clearSession, loadSession, rememberEmail, saveSession } from './storage';

interface AuthState {
  user: User | null;
  /** true, поки відновлюємо збережену сесію після перезавантаження */
  restoring: boolean;
  login: (payload: LoginPayload, remember: boolean) => Promise<User>;
  logout: (reason?: 'expired' | 'manual') => void;
  /** Повідомлення для екрана входу (наприклад, «сесія завершилась») */
  notice: string | null;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const logout = useCallback((reason: 'expired' | 'manual' = 'manual') => {
    window.clearTimeout(timer.current);
    clearSession();
    setAuthToken(null);
    setUser(null);
    if (reason === 'expired') setNotice('Сесія завершилась. Увійдіть ще раз.');
  }, []);

  const scheduleExpiry = useCallback(
    (expiresAt: number) => {
      window.clearTimeout(timer.current);
      const ms = Math.max(0, expiresAt - Date.now());
      timer.current = window.setTimeout(() => logout('expired'), Math.min(ms, 2 ** 31 - 1));
    },
    [logout],
  );

  // Відновлення сесії
  useEffect(() => {
    const saved = loadSession();
    if (!saved) {
      setRestoring(false);
      return;
    }
    setAuthToken(saved.token);
    fetchMe(saved.token)
      .then((u) => {
        setUser(u);
        scheduleExpiry(saved.expiresAt);
      })
      .catch(() => logout('expired'))
      .finally(() => setRestoring(false));
    return () => window.clearTimeout(timer.current);
  }, [logout, scheduleExpiry]);

  const login = useCallback(
    async (payload: LoginPayload, remember: boolean) => {
      const res = await apiLogin(payload);
      const expiresAt = Date.now() + res.expires_in * 1000;
      setAuthToken(res.access_token);
      saveSession({ token: res.access_token, user: res.user, expiresAt });
      rememberEmail(remember ? res.user.email : null);
      scheduleExpiry(expiresAt);
      setNotice(null);
      setUser(res.user);
      return res.user;
    },
    [scheduleExpiry],
  );

  const value = useMemo<AuthState>(
    () => ({ user, restoring, login, logout, notice, clearNotice: () => setNotice(null) }),
    [user, restoring, login, logout, notice],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
