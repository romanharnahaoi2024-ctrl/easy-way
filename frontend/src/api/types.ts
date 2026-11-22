import type { Role } from '../config/roles';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  organization: string;
}

/** Відповідь POST /auth/login — домовленість з бекендом (див. README, розділ «Контракт з API»). */
export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  /** Строк дії токена в секундах */
  expires_in: number;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}
