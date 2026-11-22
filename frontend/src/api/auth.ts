import { request, USE_MOCK } from './http';
import { mockLogin, mockMe } from './mock';
import type { LoginPayload, LoginResponse, User } from './types';

/**
 * POST /auth/login → { access_token, token_type, expires_in, user }
 * Якщо бекенд на FastAPI використовує OAuth2PasswordRequestForm, замініть тіло на
 * new URLSearchParams({ username: email, password }) — більше нічого в клієнті змінювати не треба.
 */
export function login(payload: LoginPayload): Promise<LoginResponse> {
  if (USE_MOCK) return mockLogin(payload);
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: payload.email.trim().toLowerCase(), password: payload.password }),
  });
}

/** GET /auth/me — перевірка збереженої сесії після перезавантаження сторінки */
export function fetchMe(token: string): Promise<User> {
  if (USE_MOCK) return mockMe(token);
  return request<User>('/auth/me');
}
