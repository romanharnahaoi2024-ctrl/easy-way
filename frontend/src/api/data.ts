/**
 * Клієнт API для екранів EZW-49…EZW-53 (EZW-54).
 * VITE_USE_MOCK=true → демо-сервер у браузері; false → справжній REST API за адресою VITE_API_URL.
 * Очікуваний контракт описано в docs/API_CONTRACT.md.
 */
import { qs, request, USE_MOCK } from './http';
/** Демо-сервер завантажується лише в демо-режимі (динамічний імпорт вирізається зі збірки при VITE_USE_MOCK=false) */
const mock = () => import('./mock/server');
import type {
  AuditEvent, AuditFilters, Consent, Dataset, ExchangePayload, ExchangeRequest, ExchangeResult, Route, Submission, TransitMode, VehiclePosition,
} from './types';

export const getRoutes = (): Promise<Route[]> => (USE_MOCK ? mock().then((x) => x.getRoutes()) : request('/routes'));

export const getVehiclePositions = (): Promise<VehiclePosition[]> => (USE_MOCK ? mock().then((x) => x.getVehiclePositions()) : request('/vehicles/positions'));

export const listDatasets = (): Promise<Dataset[]> => (USE_MOCK ? mock().then((x) => x.listDatasets()) : request('/datasets'));

export const createExchangeRequest = (p: ExchangePayload): Promise<ExchangeResult> =>
  USE_MOCK ? mock().then((x) => x.createExchangeRequest(p)) : request('/exchange/requests', { method: 'POST', body: JSON.stringify(p) });

export const listMyRequests = (): Promise<ExchangeRequest[]> => (USE_MOCK ? mock().then((x) => x.listMyRequests()) : request('/exchange/requests?mine=true'));

export const listConsents = (all = false): Promise<Consent[]> => (USE_MOCK ? mock().then((x) => x.listConsents(all)) : request(`/consents${all ? '?all=true' : ''}`));

export const grantConsent = (dataset_code: string, valid_until: string): Promise<Consent> =>
  USE_MOCK ? mock().then((x) => x.grantConsent(dataset_code, valid_until)) : request('/consents', { method: 'POST', body: JSON.stringify({ dataset_code, valid_until }) });

export const revokeConsent = (id: string): Promise<Consent> =>
  USE_MOCK ? mock().then((x) => x.revokeConsent(id)) : request(`/consents/${encodeURIComponent(id)}/revoke`, { method: 'POST' });

export const submitDataset = (dataset_code: string, file_name: string, data: unknown): Promise<Submission> =>
  USE_MOCK
    ? mock().then((x) => x.submitDataset(dataset_code, file_name, data))
    : request(`/datasets/${encodeURIComponent(dataset_code)}/submissions${qs({ file_name })}`, { method: 'POST', body: JSON.stringify(data) });

export const listSubmissions = (): Promise<Submission[]> => (USE_MOCK ? mock().then((x) => x.listSubmissions()) : request('/submissions'));

export const listAuditEvents = (f: AuditFilters = {}): Promise<AuditEvent[]> =>
  USE_MOCK
    ? mock().then((x) => x.listAuditEvents(f))
    : request(`/audit/events${qs({ from: f.from, to: f.to, outcome: f.outcome || undefined, role: f.role || undefined, dataset: f.dataset, q: f.q })}`);

export const logAuditExport = (rows: number) => (USE_MOCK ? mock().then((x) => x.logAuditExport(rows)) : Promise.resolve());

/** Вид транспорту: з відповіді API або за кодом маршруту (Т — трамвай, Тр — тролейбус, решта — автобус) */
export function routeMode(r: Pick<Route, 'code' | 'mode'>): TransitMode {
  if (r.mode) return r.mode;
  if (/^(Тр|Tr)/i.test(r.code)) return 'trolleybus';
  if (/^(Т|T)\d/.test(r.code)) return 'tram';
  return 'bus';
}
