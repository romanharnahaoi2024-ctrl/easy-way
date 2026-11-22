import { describe, expect, it } from 'vitest';
import { validateLogin } from '../auth/validation';
import { canAccess, HOME_BY_ROLE } from '../config/roles';
import { DEMO_PASSWORD, DEMO_USERS, decodeTokenPayload, makeMockToken, mockLogin } from '../api/mock';

describe('validateLogin', () => {
  it('вимагає обидва поля', () => {
    expect(validateLogin('', '')).toEqual({ email: 'Вкажіть електронну пошту.', password: 'Вкажіть пароль.' });
  });
  it('відхиляє некоректний email', () => {
    expect(validateLogin('ivan@', 'password123').email).toMatch(/помилка/);
  });
  it('вимагає щонайменше 8 символів пароля', () => {
    expect(validateLogin('a@b.ua', '1234567').password).toMatch(/8 символів/);
  });
  it('пропускає коректні дані', () => {
    expect(validateLogin('  i.melnyk@easyway.lviv.ua ', 'easyway2026')).toEqual({});
  });
});

describe('RBAC на клієнті', () => {
  it('споживач даних не бачить журнал аудиту й панель перевізника', () => {
    expect(canAccess('consumer', '/audit')).toBe(false);
    expect(canAccess('consumer', '/carrier')).toBe(false);
    expect(canAccess('consumer', '/exchange')).toBe(true);
  });
  it('мапа доступна всім ролям, а домашня сторінка кожної ролі — дозволена', () => {
    for (const role of ['carrier', 'consumer', 'admin', 'auditor'] as const) {
      expect(canAccess(role, '/map')).toBe(true);
      expect(canAccess(role, HOME_BY_ROLE[role])).toBe(true);
    }
  });
});

describe('демо-API', () => {
  it('видає токен з роллю та строком дії', async () => {
    const res = await mockLogin({ email: DEMO_USERS.auditor.email, password: DEMO_PASSWORD }, 0);
    const payload = decodeTokenPayload(res.access_token);
    expect(res.user.role).toBe('auditor');
    expect(payload?.role).toBe('auditor');
    expect(payload!.exp! - Math.floor(Date.now() / 1000)).toBeGreaterThan(29 * 60);
  });
  it('відповідає 401 на невірний пароль', async () => {
    await expect(mockLogin({ email: DEMO_USERS.carrier.email, password: 'wrong-pass' }, 0)).rejects.toMatchObject({ status: 401 });
  });
  it('коректно кодує кирилицю в токені', () => {
    const token = makeMockToken(DEMO_USERS.consumer);
    expect(decodeTokenPayload(token)?.sub).toBe('u-consumer');
  });
});
