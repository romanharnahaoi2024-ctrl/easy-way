import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../App';
import type { Role } from '../config/roles';
import { DEMO_USERS, makeMockToken } from '../api/mock';
import { setAuthToken, ApiError } from '../api/http';
import * as api from '../api/data';
import { stepsFor } from '../pages/ExchangePage';
import { sampleGps } from '../pages/CarrierPage';
import { chainIntact, toCsv } from '../pages/AuditPage';
import { consentState } from '../pages/ConsentPage';

function as(role: Role) {
  const token = makeMockToken(DEMO_USERS[role]);
  setAuthToken(token);
  sessionStorage.setItem('easyway.session', JSON.stringify({ token, user: DEMO_USERS[role], expiresAt: Date.now() + 1_800_000 }));
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}
async function status(p: Promise<unknown>) {
  try {
    await p;
    return { status: 200 };
  } catch (e) {
    const ae = e as ApiError;
    return { status: ae.status, reason: ae.body?.reason_code, request_id: ae.body?.request_id };
  }
}

describe('API керованого обміну (демо-сервер за контрактом)', () => {
  it('200 → маскування; після відкликання згоди → 403 CONSENT_REVOKED; аудит з тим самим request_id', async () => {
    as('consumer');
    const ok = await api.createExchangeRequest({ dataset_code: 'gps-demo', action: 'read', purpose: 'Аналіз пунктуальності' });
    expect(ok.state).toBe('approved');
    expect(String(ok.records[0].fleet_code)).toMatch(/^veh_[0-9a-f]{8}$/);
    await api.revokeConsent('CN-2026-014');
    const denied = await status(api.createExchangeRequest({ dataset_code: 'gps-demo', action: 'read', purpose: 'Повторний запит' }));
    expect(denied).toMatchObject({ status: 403, reason: 'CONSENT_REVOKED' });
    as('auditor');
    const ev = await api.listAuditEvents({ q: denied.request_id ?? undefined });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ outcome: 'denied', reason_code: 'CONSENT_REVOKED', dataset_code: 'gps-demo' });
  });

  it('403 NO_ROLE_PERMISSION для класу «Обмежені», 422 VALIDATION_FAILED для набору з lat = 95', async () => {
    as('consumer');
    expect(await status(api.createExchangeRequest({ dataset_code: 'driver-personal', action: 'read', purpose: 'Перевірка доступу' }))).toMatchObject({ status: 403, reason: 'NO_ROLE_PERMISSION' });
    expect(await status(api.createExchangeRequest({ dataset_code: 'incidents', action: 'read', purpose: 'Перевірка якості' }))).toMatchObject({ status: 422, reason: 'VALIDATION_FAILED' });
  });

  it('подання перевізника: коректний файл прийнято, файл з lat = 95 → 422; споживач не бачить журнал', async () => {
    as('carrier');
    expect((await api.submitDataset('gps-demo', 'ok.json', sampleGps(false))).state).toBe('accepted');
    expect(await status(api.submitDataset('gps-demo', 'bad.json', sampleGps(true)))).toMatchObject({ status: 422, reason: 'VALIDATION_FAILED' });
    as('consumer');
    expect(await status(api.listAuditEvents())).toMatchObject({ status: 403 });
  });

  it('кроки обміну відповідають коду відповіді', () => {
    const o = (reason: string) => ({ http: 0, reason: reason as never, message: '' });
    expect(stepsFor(o('OK'), true)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'done']);
    expect(stepsFor(o('OK'), false)[3]).toBe('skip');
    expect(stepsFor(o('NO_ROLE_PERMISSION'), true)[2]).toBe('fail');
    expect(stepsFor(o('NO_CONSENT'), true)[3]).toBe('fail');
    expect(stepsFor(o('CONSENT_REVOKED'), true)[3]).toBe('fail');
    expect(stepsFor(o('VALIDATION_FAILED'), true)[4]).toBe('fail');
  });

  it('журнал: ланцюжок контрольних сум цілісний, CSV з BOM і заголовком', async () => {
    as('auditor');
    const ev = await api.listAuditEvents();
    expect(chainIntact(ev)).toBe(true);
    expect(chainIntact([{ ...ev[0], prev_hash: 'broken' }, ...ev.slice(1)])).toBe(false);
    const csv = toCsv(ev.slice(0, 2));
    expect(csv.startsWith('﻿id;occurred_at')).toBe(true);
  });

  it('стан згоди: активна, закінчується, відкликана', () => {
    const base = { id: 'x', user_email: 'a', dataset_code: 'gps-demo', granted_at: '2026-01-01T00:00:00Z', revoked_at: null };
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(consentState({ ...base, valid_until: '2027-06-01T00:00:00Z' }, now)).toBe('active');
    expect(consentState({ ...base, valid_until: '2026-12-01T00:00:00Z' }, now)).toBe('expiring');
    expect(consentState({ ...base, valid_until: '2027-06-01T00:00:00Z', revoked_at: '2026-11-20T00:00:00Z' }, now)).toBe('revoked');
  });
});

describe('Екрани тижня 2', () => {
  it('EZW-50: запит на дозволений набір → 200, на «Персональні дані водіїв» → 403', async () => {
    as('consumer');
    const user = userEvent.setup();
    renderAt('/exchange');
    await user.click(await screen.findByRole('button', { name: 'Надіслати запит' }));
    expect(await screen.findByRole('heading', { name: 'Дані видано' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('HTTP 200')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Персональні дані водіїв/ }));
    await user.click(screen.getByRole('button', { name: 'Надіслати запит' }));
    expect(await screen.findByRole('heading', { name: 'Запит відхилено' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('Роль не має права на цю дію')).toBeInTheDocument();
  });

  it('EZW-50: порожня мета не відправляється', async () => {
    as('consumer');
    const user = userEvent.setup();
    renderAt('/exchange');
    await user.clear(await screen.findByLabelText('Мета використання'));
    await user.click(screen.getByRole('button', { name: 'Надіслати запит' }));
    expect(screen.getByRole('alert')).toHaveTextContent('щонайменше 10 символів');
  });

  it('EZW-51: споживач відкликає згоду через діалог підтвердження', async () => {
    as('consumer');
    const user = userEvent.setup();
    renderAt('/consents');
    const item = await screen.findByRole('article', { name: 'GPS-позиції транспорту (реальний час)' });
    await user.click(within(item).getByRole('button', { name: 'Відкликати' }));
    const dlg = screen.getByRole('dialog', { name: 'Відкликати згоду?' });
    await user.click(within(dlg).getByRole('button', { name: 'Відкликати' }));
    expect(await within(item).findByText('Відкликана')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Надати згоду' })).toBeInTheDocument();
  });

  it('EZW-52: файл з помилкою показує помилки ще до надсилання, сервер повертає 422', async () => {
    as('carrier');
    const user = userEvent.setup();
    renderAt('/carrier');
    await user.click(await screen.findByRole('button', { name: 'GPS-файл з помилкою (lat = 95)' }));
    expect(screen.getByText('Є помилки')).toBeInTheDocument();
    expect(screen.getAllByText(/більше за допустиме/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Надіслати на сервер' }));
    expect(await screen.findByText(/HTTP 422/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('EZW-53: фільтр «Відмовлено» й деталі події з request_id', async () => {
    as('auditor');
    const user = userEvent.setup();
    renderAt('/audit');
    const table = await screen.findByRole('table', { name: 'Події журналу аудиту' });
    await user.selectOptions(screen.getByLabelText('Результат'), 'denied');
    const rows = await within(table).findAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows.slice(1)) expect(within(r).getByText('Відмовлено')).toBeInTheDocument();
    await user.click(rows[1]);
    expect(screen.getByRole('heading', { name: /Подія #A-/ })).toBeInTheDocument();
    expect(screen.getByText('Ланцюжок контрольних сум')).toBeInTheDocument();
  });
});
