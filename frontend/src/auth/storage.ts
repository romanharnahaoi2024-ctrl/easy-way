import type { User } from '../api/types';

/**
 * Збереження сесії. «Запам’ятати мене» → localStorage, інакше sessionStorage (до закриття вкладки).
 * Сховище може бути недоступне (приватний режим, вбудований перегляд), тому всі виклики в try/catch.
 */
const KEY = 'easyway.session';

export interface StoredSession {
  token: string;
  user: User;
  expiresAt: number; // мс since epoch
}

function stores(): Storage[] {
  const list: Storage[] = [];
  try {
    list.push(window.sessionStorage);
  } catch {
    /* недоступне */
  }
  try {
    list.push(window.localStorage);
  } catch {
    /* недоступне */
  }
  return list;
}

export function saveSession(s: StoredSession, remember: boolean) {
  clearSession();
  try {
    (remember ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch {
    /* сесія житиме лише в пам’яті */
  }
}

export function loadSession(): StoredSession | null {
  for (const st of stores()) {
    try {
      const raw = st.getItem(KEY);
      if (!raw) continue;
      const s = JSON.parse(raw) as StoredSession;
      if (s.expiresAt > Date.now()) return s;
      st.removeItem(KEY);
    } catch {
      /* пошкоджений запис — ігноруємо */
    }
  }
  return null;
}

export function clearSession() {
  for (const st of stores()) {
    try {
      st.removeItem(KEY);
    } catch {
      /* ігноруємо */
    }
  }
}
