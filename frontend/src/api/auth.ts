import { request, USE_MOCK } from './http';
import type { Role } from '../config/roles';
import type { LoginPayload, LoginResponse, User } from './types';

/** Користувач у вигляді, який віддає сервер EZW-40/42: id — число, full_name і organization поки null */
type UserRaw = Omit<User, 'id' | 'full_name' | 'organization' | 'role'> & {
  id: string | number;
  full_name?: string | null;
  organization?: string | null;
  role?: Role | null;
  roles?: Role[];
};

/** null у full_name/organization не має ламати екрани: показуємо email, організацію не показуємо */
export function normalizeUser(u: UserRaw): User {
  return {
    id: String(u.id),
    email: u.email,
    full_name: u.full_name?.trim() || u.email,
    role: (u.role ?? u.roles?.[0] ?? 'consumer') as Role,
    organization: u.organization?.trim() || null,
  };
}

/**
 * POST /auth/login → { access_token, token_type, expires_in, user }
 * Якщо бекенд на FastAPI використовує OAuth2PasswordRequestForm, замініть тіло на
 * new URLSearchParams({ username: email, password }) — більше нічого в клієнті змінювати не треба.
 */
export function login(payload: LoginPayload): Promise<LoginResponse> {
  if (USE_MOCK) return import('./mock').then((m) => m.mockLogin(payload));
  return request<LoginResponse & { user: UserRaw }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: payload.email.trim().toLowerCase(), password: payload.password }),
  }).then((r) => ({ ...r, user: normalizeUser(r.user) }));
}

/** GET /auth/me — перевірка збереженої сесії після перезавантаження сторінки */
export function fetchMe(token: string): Promise<User> {
  if (USE_MOCK) return import('./mock').then((m) => m.mockMe(token));
  return request<UserRaw>('/auth/me').then(normalizeUser);
}
