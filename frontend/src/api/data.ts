/**
 * Клієнт API для екранів EZW-49…EZW-53 (EZW-54).
 * VITE_USE_MOCK=true → демо-сервер у браузері; false → справжній REST API за адресою VITE_API_URL.
 * Очікуваний контракт описано в ../docs/API_CONTRACT.md (узгоджено з П4 25.11.2026, EZW-42).
 */
import { ApiError, qs, request, USE_MOCK } from './http';
/** Демо-сервер завантажується лише в демо-режимі (динамічний імпорт вирізається зі збірки при VITE_USE_MOCK=false) */
const mock = () => import('./mock/server');
import type {
  AuditEvent, AuditEventRaw, AuditFilters, Consent, Dataset, ExchangePayload, ExchangeRequest, ExchangeResult, Route, Submission, TransitMode, VehiclePosition,
} from './types';

export const getRoutes = (): Promise<Route[]> => (USE_MOCK ? mock().then((x) => x.getRoutes()) : request('/routes'));

export const getVehiclePositions = (): Promise<VehiclePosition[]> => (USE_MOCK ? mock().then((x) => x.getVehiclePositions()) : request('/positions/latest'));

export const listDatasets = (): Promise<Dataset[]> =>
  USE_MOCK ? mock().then((x) => x.listDatasets()) : request<Dataset[]>('/datasets').then((l) => l.map(normalizeDataset));

/** Людські назви відомих наборів: сервер EZW-42 віддає лише code, kind, schema_version, requires_consent */
const DATASET_TITLES: Record<string, string> = {
  'gps-demo': 'GPS-позиції транспорту (демо)',
  'schedule-demo': 'Розклад руху (демо)',
};
export function normalizeDataset(d: Dataset): Dataset {
  return { ...d, title: d.title ?? DATASET_TITLES[d.code] ?? d.code };
}

export const createExchangeRequest = (p: ExchangePayload): Promise<ExchangeResult> =>
  USE_MOCK
    ? mock().then((x) => x.createExchangeRequest(p))
    : request<Partial<ExchangeResult>>('/exchange/requests', { method: 'POST', body: JSON.stringify(p) }).then(normalizeExchangeResult);

/** Відповідь 200 без необов'язкових полів не ламає екран: masked_fields поки завжди [] (маскування на сервері ще немає) */
export function normalizeExchangeResult(r: Partial<ExchangeResult>): ExchangeResult {
  const records = Array.isArray(r.records) ? r.records : [];
  return {
    request_id: String(r.request_id ?? ''),
    state: 'approved',
    dataset_code: r.dataset_code ?? '',
    records,
    total: typeof r.total === 'number' ? r.total : records.length,
    masked_fields: Array.isArray(r.masked_fields) ? r.masked_fields : [],
  };
}

export const listMyRequests = (): Promise<ExchangeRequest[]> =>
  USE_MOCK
    ? mock().then((x) => x.listMyRequests())
    : request<(Omit<ExchangeRequest, 'request_id'> & { request_id: string | number })[]>('/exchange/requests?mine=true').then((l) =>
        l.map((r) => ({ ...r, request_id: String(r.request_id) })),
      );

export const listConsents = (all = false): Promise<Consent[]> =>
  USE_MOCK
    ? mock().then((x) => x.listConsents(all))
    : request<(Omit<Consent, 'id'> & { id: string | number })[]>('/consents') /* для admin сервер сам повертає всі згоди */
        .then((l) => l.map((c) => ({ ...c, id: String(c.id) })));

/** Сервер приймає valid_until лише як дату-час із часовим поясом: «2027-01-31» → кінець цього дня за місцевим часом */
export function toServerDateTime(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T23:59:59`).toISOString() : v;
}

export const grantConsent = (dataset_code: string, valid_until: string): Promise<Consent> =>
  USE_MOCK
    ? mock().then((x) => x.grantConsent(dataset_code, valid_until))
    : request<Omit<Consent, 'id'> & { id: string | number }>('/consents', { method: 'POST', body: JSON.stringify({ dataset_code, valid_until: toServerDateTime(valid_until) }) }).then(
        (c) => ({ ...c, id: String(c.id) }),
      );

export const revokeConsent = (id: string): Promise<Consent | null> =>
  USE_MOCK ? mock().then((x) => x.revokeConsent(id)) : request<Consent | null>(`/consents/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const submitDataset = (dataset_code: string, file_name: string, data: unknown): Promise<Submission> =>
  USE_MOCK
    ? mock().then((x) => x.submitDataset(dataset_code, file_name, data))
    : request(`/datasets/${encodeURIComponent(dataset_code)}/submissions${qs({ file_name })}`, { method: 'POST', body: JSON.stringify(data) });

/** UC-05 (подання файлів) до EZW-42 не входить: поки сервер відповідає 404, історія подань порожня */
export const listSubmissions = (): Promise<Submission[]> =>
  USE_MOCK
    ? mock().then((x) => x.listSubmissions())
    : request<Submission[]>('/submissions').catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return [];
        throw e;
      });

export const listAuditEvents = (f: AuditFilters = {}): Promise<AuditEvent[]> =>
  USE_MOCK
    ? mock().then((x) => x.listAuditEvents(f))
    : request<AuditEventRaw[] | { items: AuditEventRaw[] }>(`/audit${qs({ from: f.from, to: f.to, outcome: f.outcome || undefined, role: f.role || undefined, dataset: f.dataset, q: f.q })}`).then(
        (data) => filterAudit((Array.isArray(data) ? data : (data?.items ?? [])).map(normalizeAudit), f),
      );

/**
 * Запис аудиту від сервера → вигляд, який показує екран.
 * Сервер віддає id, request_id, occurred_at, outcome, reason_code, user_id, dataset; для подій без запиту user_id і dataset — null.
 */
export function normalizeAudit(e: AuditEventRaw): AuditEvent {
  const noUser = e.user_id === null || e.user_id === undefined;
  return {
    id: String(e.id),
    request_id: e.request_id === null || e.request_id === undefined ? null : String(e.request_id),
    occurred_at: e.occurred_at,
    user_email: e.user_email ?? (noUser ? 'Система' : `користувач #${e.user_id}`),
    role: e.role ?? (noUser ? 'system' : 'unknown'),
    action: e.action ?? (e.request_id ? 'exchange.request' : 'audit.event'),
    dataset_code: e.dataset_code ?? e.dataset ?? null,
    outcome: e.outcome,
    reason_code: e.reason_code,
    details: e.details,
    hash: e.hash,
    prev_hash: e.prev_hash,
  };
}

/** Фільтри застосовуються й на клієнті: якщо сервер якісь параметри ігнорує, вибірка однаково правильна */
export function filterAudit(list: AuditEvent[], f: AuditFilters): AuditEvent[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter((e) => {
    const t = Date.parse(e.occurred_at);
    if (f.from && t < Date.parse(f.from)) return false;
    if (f.to && t > Date.parse(f.to)) return false;
    if (f.outcome && e.outcome !== f.outcome) return false;
    if (f.role && e.role !== f.role) return false;
    if (f.dataset && e.dataset_code !== f.dataset) return false;
    if (q && ![e.request_id, e.user_email, e.dataset_code, e.reason_code, e.action, e.id].some((v) => v && String(v).toLowerCase().includes(q))) return false;
    return true;
  });
}

export const logAuditExport = (rows: number) => (USE_MOCK ? mock().then((x) => x.logAuditExport(rows)) : Promise.resolve());

/** Вид транспорту: з відповіді API або за кодом маршруту (Т — трамвай, Тр — тролейбус, решта — автобус) */
export function routeMode(r: Pick<Route, 'code' | 'mode'>): TransitMode {
  if (r.mode) return r.mode;
  if (/^(Тр|Tr)/i.test(r.code)) return 'trolleybus';
  if (/^(Т|T)\d/.test(r.code)) return 'tram';
  return 'bus';
}
