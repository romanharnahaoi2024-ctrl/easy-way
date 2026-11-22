import { describe, expect, it } from 'vitest';
import { clearSession, rememberEmail, rememberedEmail, saveSession } from '../auth/storage';
import { DEMO_USERS } from '../api/mock';

describe('Безпека сесії (зауваження рецензента)', () => {
  it('токен зберігається лише в sessionStorage, не в localStorage', () => {
    saveSession({ token: 'a.b.c', user: DEMO_USERS.consumer, expiresAt: Date.now() + 60_000 });
    expect(sessionStorage.getItem('easyway.session')).toContain('a.b.c');
    expect(Object.values(localStorage).join('')).not.toContain('a.b.c');
    clearSession();
    expect(sessionStorage.getItem('easyway.session')).toBeNull();
  });
  it('«Запам’ятати» зберігає лише email', () => {
    rememberEmail('i.melnyk@easyway.lviv.ua');
    expect(rememberedEmail()).toBe('i.melnyk@easyway.lviv.ua');
    expect(Object.keys(localStorage)).toEqual(['easyway.lastEmail']);
  });
});

describe('Валідація без eval (CSP script-src без unsafe-eval)', () => {
  it('validateRecords не викликає new Function', async () => {
    const orig = globalThis.Function;
    const spy = function () { throw new Error('new Function заборонено CSP'); } as unknown as FunctionConstructor;
    (globalThis as { Function: FunctionConstructor }).Function = spy;
    try {
      const { validateRecords } = await import('../api/schemas');
      const ok = validateRecords('gps', [{ fleet_code: 'A1', lat: 49.8, lon: 24.0, observed_at: '2026-11-18T10:00:00Z' }]);
      expect(ok.valid).toBe(true);
      const bad = validateRecords('gps', [{ fleet_code: 'A1', lat: 95, lon: 24.0, observed_at: 'вчора' }]);
      expect(bad.valid).toBe(false);
      expect(bad.errors.length).toBe(2);
    } finally {
      (globalThis as { Function: FunctionConstructor }).Function = orig;
    }
  });
});
