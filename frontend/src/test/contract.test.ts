/**
 * Узгодження з П4 від 25.11.2026 (EZW-42): коди причин як у журналі аудиту,
 * формат GET /audit, відповідь 200 без маскування, помилки без reason_code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, isConsentReason, reasonFromStatus, request } from '../api/http';
import { filterAudit, normalizeAudit, normalizeExchangeResult } from '../api/data';
import { REASON } from '../lib/format';
import { normalizeUser } from '../api/auth';
import { hasChecksums } from '../pages/AuditPage';
import { initials } from '../components/ui';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body === undefined ? '' : JSON.stringify(body), { status })));
}

async function fail(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('очікувалась помилка');
}

describe('коди причин (узгоджено з П4)', () => {
  it('для кожного коду є текст українською', () => {
    for (const c of ['OK', 'UNAUTHENTICATED', 'NO_ROLE_PERMISSION', 'NO_CONSENT', 'CONSENT_REVOKED', 'VALIDATION_FAILED']) expect(REASON[c]).toBeTruthy();
  });

  it('відкликана й відсутня згода зупиняють запит на кроці згоди', () => {
    expect(isConsentReason('NO_CONSENT')).toBe(true);
    expect(isConsentReason('CONSENT_REVOKED')).toBe(true);
    expect(isConsentReason('NO_ROLE_PERMISSION')).toBe(false);
  });

  it('reason_code від сервера передається як є, request_id = null для 401', async () => {
    stubFetch(403, { detail: 'Згоду відкликано', reason_code: 'CONSENT_REVOKED', request_id: 'req_7' });
    const e = await fail(request('/exchange/requests', { method: 'POST', body: '{}' }));
    expect(e.status).toBe(403);
    expect(e.body).toMatchObject({ reason_code: 'CONSENT_REVOKED', request_id: 'req_7', errors: [] });

    stubFetch(401, { detail: 'Not authenticated', request_id: null });
    const u = await fail(request('/exchange/requests'));
    expect(u.body).toMatchObject({ reason_code: 'UNAUTHENTICATED', request_id: null });
  });

  it('якщо reason_code не прийшов, причину визначаємо за статусом', () => {
    expect(reasonFromStatus(401)).toBe('UNAUTHENTICATED');
    expect(reasonFromStatus(422)).toBe('VALIDATION_FAILED');
    expect(reasonFromStatus(403, 'Роль не має права')).toBe('NO_ROLE_PERMISSION');
    expect(reasonFromStatus(403, 'Немає чинної згоди')).toBe('NO_CONSENT');
  });

  it('422 з порожнім errors не ламає клієнт', async () => {
    stubFetch(422, { detail: 'Дані не пройшли перевірку', reason_code: 'VALIDATION_FAILED', request_id: 'req_9' });
    const e = await fail(request('/exchange/requests'));
    expect(e.body?.errors).toEqual([]);
  });
});

describe('відповідь 200 і журнал аудиту від сервера', () => {
  it('masked_fields і total необов’язкові', () => {
    const r = normalizeExchangeResult({ request_id: 'req_1', dataset_code: 'gps-demo', records: [{ a: 1 }, { a: 2 }] });
    expect(r).toMatchObject({ state: 'approved', total: 2, masked_fields: [] });
  });

  it('запис GET /audit перетворюється на рядок журналу', () => {
    const ex = normalizeAudit({ id: 5, request_id: 'req_1', occurred_at: '2026-11-27T10:00:00Z', outcome: 'denied', reason_code: 'NO_CONSENT', user_id: 12, dataset: 'gps-demo' });
    expect(ex).toMatchObject({ id: '5', user_email: 'користувач #12', role: 'unknown', action: 'exchange.request', dataset_code: 'gps-demo' });
    const sys = normalizeAudit({ id: 6, request_id: null, occurred_at: '2026-11-27T10:01:00Z', outcome: 'info', reason_code: 'OK', user_id: null, dataset: null });
    expect(sys).toMatchObject({ user_email: 'Система', role: 'system', action: 'audit.event', dataset_code: null });
  });

  it('фільтри журналу працюють навіть якщо сервер їх ігнорує', () => {
    const list = [
      normalizeAudit({ id: 1, request_id: 'req_1', occurred_at: '2026-11-27T10:00:00Z', outcome: 'approved', reason_code: 'OK', user_id: 1, dataset: 'gps-demo' }),
      normalizeAudit({ id: 2, request_id: 'req_2', occurred_at: '2026-11-27T11:00:00Z', outcome: 'denied', reason_code: 'NO_ROLE_PERMISSION', user_id: 1, dataset: 'driver-personal' }),
    ];
    expect(filterAudit(list, { outcome: 'denied' }).map((e) => e.id)).toEqual(['2']);
    expect(filterAudit(list, { q: 'req_1' }).map((e) => e.id)).toEqual(['1']);
    expect(filterAudit(list, { dataset: 'gps-demo' })).toHaveLength(1);
  });
});

describe('реальні відповіді сервера EZW-42 (прогін 27.11)', () => {
  it('request_id-число з помилки стає рядком', async () => {
    stubFetch(403, { detail: 'no valid consent', reason_code: 'NO_CONSENT', request_id: 7 });
    const e = await fail(request('/exchange/requests', { method: 'POST', body: '{}' }));
    expect(e.body?.request_id).toBe('7');
    expect(e.message).toBe('Немає чинної згоди на обробку цього набору даних.');
  });

  it('англійські тексти сервера показуються українською', async () => {
    stubFetch(401, { detail: 'invalid credentials', reason_code: 'UNAUTHENTICATED', request_id: null });
    expect((await fail(request('/auth/login'))).message).toBe('Невірна електронна пошта або пароль.');
  });

  it('full_name і organization = null не ламають екрани', () => {
    const u = normalizeUser({ id: 3, email: 'i.melnyk@easyway.lviv.ua', full_name: null, role: 'consumer', organization: null, roles: ['consumer'] });
    expect(u).toEqual({ id: '3', email: 'i.melnyk@easyway.lviv.ua', full_name: 'i.melnyk@easyway.lviv.ua', role: 'consumer', organization: null });
    expect(initials(null)).toBe('');
    expect(initials(u.full_name)).toBe('IM');
  });

  it('без hash/prev_hash журнал не заявляє про цілісний ланцюжок', () => {
    const e = normalizeAudit({ id: 1, request_id: 4, occurred_at: '2026-11-27T13:05:06Z', outcome: 'approved', reason_code: 'OK', user_id: 3, dataset: 'gps-demo' });
    expect(e.request_id).toBe('4');
    expect(hasChecksums([e])).toBe(false);
  });
});
