/**
 * Демо-режим без бекенду (VITE_USE_MOCK=true).
 * Імітує POST /auth/login і GET /auth/me, поки П4 не підніме справжній API (EZW-38, EZW-40).
 */
import type { Role } from '../config/roles';
import { ApiError } from './http';
import type { LoginPayload, LoginResponse, User } from './types';

export const DEMO_PASSWORD = 'easyway2026';
const TOKEN_TTL_SECONDS = 30 * 60;

export const DEMO_USERS: Record<Role, User> = {
  carrier: { id: 'u-carrier', email: 'o.boiko@easyway.lviv.ua', full_name: 'Олег Бойко', role: 'carrier', organization: 'КП «Електротранс»' },
  consumer: { id: 'u-consumer', email: 'i.melnyk@easyway.lviv.ua', full_name: 'Ірина Мельник', role: 'consumer', organization: 'Департамент мобільності' },
  admin: { id: 'u-admin', email: 'm.hnatyshyn@easyway.lviv.ua', full_name: 'Марта Гнатишин', role: 'admin', organization: 'EasyWay · Data Governance' },
  auditor: { id: 'u-auditor', email: 'a.tkach@easyway.lviv.ua', full_name: 'Андрій Ткач', role: 'auditor', organization: 'Служба внутрішнього аудиту' },
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function base64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Неперевірюваний «JWT» лише для демо: заголовок.тіло.mock */
export function makeMockToken(user: User, ttl = TOKEN_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ sub: user.id, role: user.role, iat: now, exp: now + ttl }));
  return `${header}.${body}.mock`;
}

export async function mockLogin({ email, password }: LoginPayload, latency = 450): Promise<LoginResponse> {
  await delay(latency);
  const user = Object.values(DEMO_USERS).find((u) => u.email === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) {
    throw new ApiError('Невірна електронна пошта або пароль.', 401);
  }
  return { access_token: makeMockToken(user), token_type: 'bearer', expires_in: TOKEN_TTL_SECONDS, user };
}

export async function mockMe(token: string): Promise<User> {
  await delay(120);
  const role = decodeTokenPayload(token)?.role as Role | undefined;
  if (!role || !DEMO_USERS[role]) throw new ApiError('Сесія недійсна.', 401);
  return DEMO_USERS[role];
}

export function decodeTokenPayload(token: string): { exp?: number; role?: string; sub?: string } | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
