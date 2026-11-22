import type { User } from '../api/types';

/**
 * Збереження сесії.
 *
 * Токен НЕ зберігається в localStorage: звідти його може прочитати будь-який скрипт при XSS і він живе необмежено.
 * Токен лежить у sessionStorage — зникає з закриттям вкладки, має строк 30 хв і перевіряється сервером (GET /auth/me).
 * Це компроміс для клієнта без бекенду. Цільове рішення — httpOnly-cookie з Secure і SameSite=Strict, яку видає
 * бекенд (П4): тоді JavaScript взагалі не має доступу до токена. Див. README, розділ «Безпека».
 *
 * «Запам’ятати мене» зберігає лише email для підстановки у форму — не токен і не пароль.
 */
const KEY = 'easyway.session';
const EMAIL_KEY = 'easyway.lastEmail';

export interface StoredSession {
  token: string;
  user: User;
  expiresAt: number; // мс since epoch
}

export function saveSession(s: StoredSession) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* сесія житиме лише в пам’яті */
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (s.expiresAt > Date.now()) return s;
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* сховище недоступне або запис пошкоджений */
  }
  return null;
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(KEY);
    // прибираємо токени, які могла зберегти попередня версія клієнта
    window.localStorage.removeItem(KEY);
  } catch {
    /* ігноруємо */
  }
}

export function rememberEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(EMAIL_KEY, email);
    else window.localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ігноруємо */
  }
}

export function rememberedEmail(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}
