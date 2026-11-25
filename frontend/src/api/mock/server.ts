/**
 * Демо-сервер: повторює поведінку API з розділів 4.5–4.6 звіту (ExchangeService, AccessPolicy, ConsentService,
 * DatasetValidator) — кроки обміну, коди 200 / 403 / 422, request_id і запис аудиту для кожного результату.
 */
import type { Role } from '../../config/roles';
import { ApiError, getAuthToken } from '../http';
import { decodeTokenPayload, DEMO_USERS } from '../mock';
import { validateRecords } from '../schemas';
import type {
  AuditEvent, AuditFilters, Consent, Dataset, ExchangePayload, ExchangeRequest, ExchangeResult, Route, Submission, User, VehiclePosition,
} from '../types';
import { appendAudit, fnv, getDb, nextId, resetDb, save } from './db';
import { DATASETS, PERMISSIONS, ROUTES, VEHICLES } from './seed';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let latency = 260;
/** Для тестів */
export function setMockLatency(ms: number) {
  latency = ms;
}

function currentUser(): User {
  const token = getAuthToken();
  const role = token ? (decodeTokenPayload(token)?.role as Role | undefined) : undefined;
  if (!role || !DEMO_USERS[role]) throw new ApiError('Потрібна автентифікація.', 401, { detail: 'Потрібна автентифікація.', reason_code: 'UNAUTHENTICATED', request_id: null });
  return DEMO_USERS[role];
}

function requireRole(u: User, roles: Role[]) {
  if (!roles.includes(u.role)) throw new ApiError('Недостатньо прав для цієї дії.', 403, { detail: 'Недостатньо прав для цієї дії.', reason_code: 'NO_ROLE_PERMISSION' });
}

/* ---------------- Транспорт ---------------- */

export async function getRoutes(): Promise<Route[]> {
  await delay(latency / 2);
  currentUser();
  return ROUTES;
}

/** Точка на ламаній маршруту за параметром t ∈ [0, 1) (туди й назад) */
function pointOnRoute(route: Route, t: number): [number, number] {
  const pts = route.stops.map((s) => [s.lat, s.lon] as [number, number]);
  const path = [...pts, ...pts.slice(0, -1).reverse()];
  const segs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = (((t % 1) + 1) % 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) {
      const k = d / segs[i];
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k];
    }
    d -= segs[i];
  }
  return path[path.length - 1];
}

export function computePositions(now = Date.now()): VehiclePosition[] {
  return VEHICLES.map((v) => {
    const route = ROUTES.find((r) => r.code === v.route)!;
    const lag = (v.staleSeconds ?? 2 + (fnv(v.fleet_code).charCodeAt(0) % 6)) * 1000;
    const at = now - lag;
    const [lat, lon] = pointOnRoute(route, v.phase + at / 1000 / v.loop);
    return { fleet_code: v.fleet_code, route_code: v.route, lat: +lat.toFixed(6), lon: +lon.toFixed(6), observed_at: new Date(at).toISOString(), low_floor: v.low_floor };
  });
}

export async function getVehiclePositions(): Promise<VehiclePosition[]> {
  await delay(latency / 2);
  currentUser();
  return computePositions();
}

/* ---------------- Набори даних ---------------- */

export async function listDatasets(): Promise<Dataset[]> {
  await delay(latency / 2);
  currentUser();
  return DATASETS;
}

const can = (role: Role, dataset: string, action: 'read' | 'submit') => PERMISSIONS.some((p) => p.role === role && p.dataset === dataset && p.action === action);

/** Остання згода користувача на набір існує, але відкликана */
function wasRevoked(email: string, dataset: string): boolean {
  const mine = getDb().consents.filter((c) => c.user_email === email && c.dataset_code === dataset);
  const last = mine.sort((a, b) => Date.parse(b.granted_at) - Date.parse(a.granted_at))[0];
  return !!last?.revoked_at;
}

function activeConsent(email: string, dataset: string, at = Date.now()): Consent | undefined {
  return getDb().consents.find((c) => c.user_email === email && c.dataset_code === dataset && !c.revoked_at && Date.parse(c.granted_at) <= at && Date.parse(c.valid_until) >= at);
}

function datasetRecords(code: string): Record<string, unknown>[] {
  const now = new Date();
  switch (code) {
    case 'gps-demo':
      return computePositions().map((p) => ({ ...p, speed_kmh: 18 + (fnv(p.fleet_code).charCodeAt(1) % 20) }));
    case 'schedule-gtfs':
      return ROUTES.flatMap((r) => r.stops.map((s, i) => {
        const m = 9 * 60 + i * 7;
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        return { route_code: r.code, trip_id: `${r.code}-0900`, stop_name: s.name, stop_order: s.order, arrival: t, departure: t };
      }));
    case 'stops':
      return ROUTES.flatMap((r) => r.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, route_code: r.code })));
    case 'incidents':
      return [
        { id: 'INC-301', route_code: 'Т2', kind: 'delay', lat: 49.8151, lon: 24.0282, reported_at: new Date(now.getTime() - 9 * 60000).toISOString(), delay_min: 4 },
        // Помилковий запис від диспетчерської: широта поза межами −90…90 (сценарій EX3 / NFR-05)
        { id: 'INC-302', route_code: 'А46', kind: 'breakdown', lat: 95, lon: 23.9802, reported_at: new Date(now.getTime() - 4 * 60000).toISOString() },
      ];
    case 'occupancy':
      return VEHICLES.map((v) => ({ fleet_code: v.fleet_code, observed_at: now.toISOString(), load_pct: 20 + (fnv(v.fleet_code).charCodeAt(2) % 70) }));
    default:
      return [{ id: 'DRV-01', full_name: 'Іван П.', license: 'ВХ****12', phone: '+380 67 *** ** 18' }];
  }
}

const round50m = (x: number) => Math.round(x / 0.0005) * 0.0005;

function mask(code: string, rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; fields: string[] } {
  if (code === 'gps-demo' || code === 'occupancy') {
    return {
      rows: rows.map((r) => ({ ...r, fleet_code: `veh_${fnv(String(r.fleet_code)).slice(0, 8)}`, ...(typeof r.lat === 'number' ? { lat: +round50m(r.lat).toFixed(4), lon: +round50m(r.lon as number).toFixed(4) } : {}) })),
      fields: code === 'gps-demo' ? ['fleet_code — хеш', 'lat, lon — округлення до 50 м'] : ['fleet_code — хеш'],
    };
  }
  return { rows, fields: [] };
}

export async function createExchangeRequest(p: ExchangePayload): Promise<ExchangeResult> {
  await delay(latency);
  const u = currentUser();
  const ds = DATASETS.find((d) => d.code === p.dataset_code);
  if (!ds) throw new ApiError('Набір даних не знайдено.', 404, { detail: 'Набір даних не знайдено.' });
  const d = getDb();
  // Кроки 1–2: зареєструвати запит, видати request_id
  const req: ExchangeRequest = { request_id: nextId('req'), dataset_code: ds.code, action: p.action, state: 'pending', reason_code: 'OK', created_at: new Date().toISOString(), purpose: p.purpose, user_email: u.email };
  d.requests.unshift(req);
  const finish = (state: ExchangeRequest['state'], reason: ExchangeRequest['reason_code'], details?: Record<string, unknown>) => {
    req.state = state;
    req.reason_code = reason;
    req.finished_at = new Date().toISOString();
    // Крок 6: статус і подія аудиту фіксуються разом
    appendAudit({ request_id: req.request_id, user_email: u.email, role: u.role, action: 'exchange.request', dataset_code: ds.code, outcome: state === 'approved' ? 'approved' : state === 'denied' ? 'denied' : 'invalid', reason_code: reason, details: { purpose: p.purpose, ...details } });
    save();
  };
  // Крок 3: право ролі на дію
  if (!can(u.role, ds.code, 'read')) {
    finish('denied', 'NO_ROLE_PERMISSION', { required: PERMISSIONS.filter((x) => x.dataset === ds.code && x.action === 'read').map((x) => x.role) });
    throw new ApiError('Роль не має права читати цей набір даних.', 403, { detail: 'Роль не має права читати цей набір даних.', reason_code: 'NO_ROLE_PERMISSION', request_id: req.request_id });
  }
  // Крок 4: чинна згода, якщо її вимагає політика набору
  if (ds.requires_consent && !activeConsent(u.email, ds.code)) {
    // Відкликана згода й відсутня згода — різні причини в журналі (вимоги до аудиту)
    const revoked = wasRevoked(u.email, ds.code);
    const reason = revoked ? 'CONSENT_REVOKED' : 'NO_CONSENT';
    const detail = revoked ? 'Згоду на обробку цього набору відкликано.' : 'Немає чинної згоди на обробку цього набору.';
    finish('denied', reason);
    throw new ApiError(detail, 403, { detail, reason_code: reason, request_id: req.request_id });
  }
  // Крок 5: перевірка якості за JSON Schema
  const rows = datasetRecords(ds.code);
  const v = validateRecords(ds.kind, rows);
  if (!v.valid) {
    finish('invalid', 'VALIDATION_FAILED', { errors: v.errors.length });
    throw new ApiError('Набір не відповідає схемі, дані не видано.', 422, { detail: 'Набір не відповідає схемі, дані не видано.', reason_code: 'VALIDATION_FAILED', request_id: req.request_id, errors: v.errors });
  }
  // Крок 7: відповідь 200 із замаскованими даними
  const m = mask(ds.code, rows);
  finish('approved', 'OK', { records: rows.length });
  return { request_id: req.request_id, state: 'approved', dataset_code: ds.code, records: m.rows, total: rows.length, masked_fields: m.fields };
}

export async function listMyRequests(): Promise<ExchangeRequest[]> {
  await delay(latency / 2);
  const u = currentUser();
  return getDb().requests.filter((r) => r.user_email === u.email).slice(0, 20);
}

/* ---------------- Згода ---------------- */

export async function listConsents(all = false): Promise<Consent[]> {
  await delay(latency / 2);
  const u = currentUser();
  const list = getDb().consents;
  if (all) {
    requireRole(u, ['admin']);
    return list;
  }
  return list.filter((c) => c.user_email === u.email);
}

export async function grantConsent(dataset_code: string, valid_until: string): Promise<Consent> {
  await delay(latency);
  const u = currentUser();
  const ds = DATASETS.find((d) => d.code === dataset_code);
  if (!ds?.requires_consent) throw new ApiError('Для цього набору згода не потрібна.', 400, { detail: 'Для цього набору згода не потрібна.' });
  if (Date.parse(valid_until) <= Date.now()) throw new ApiError('Дата завершення має бути в майбутньому.', 422, { detail: 'Дата завершення має бути в майбутньому.' });
  const d = getDb();
  const c: Consent = { id: `CN-2026-${String(d.consents.length + 15).padStart(3, '0')}`, user_email: u.email, dataset_code, granted_at: new Date().toISOString(), valid_until, revoked_at: null };
  // попередня чинна згода на той самий набір замінюється новою
  for (const old of d.consents) if (old.user_email === u.email && old.dataset_code === dataset_code && !old.revoked_at) old.revoked_at = c.granted_at;
  d.consents.unshift(c);
  appendAudit({ request_id: null, user_email: u.email, role: u.role, action: 'consent.grant', dataset_code, outcome: 'info', reason_code: 'OK', details: { consent_id: c.id, valid_until } });
  save();
  return c;
}

export async function revokeConsent(id: string): Promise<Consent> {
  await delay(latency);
  const u = currentUser();
  const c = getDb().consents.find((x) => x.id === id);
  if (!c) throw new ApiError('Згоду не знайдено.', 404, { detail: 'Згоду не знайдено.' });
  if (c.user_email !== u.email && u.role !== 'admin') throw new ApiError('Недостатньо прав для цієї дії.', 403, { detail: 'Недостатньо прав для цієї дії.', reason_code: 'NO_ROLE_PERMISSION' });
  c.revoked_at = new Date().toISOString();
  appendAudit({ request_id: null, user_email: u.email, role: u.role, action: 'consent.revoke', dataset_code: c.dataset_code, outcome: 'info', reason_code: 'OK', details: { consent_id: c.id } });
  save();
  return c;
}

/* ---------------- Подання даних перевізником ---------------- */

export async function submitDataset(dataset_code: string, file_name: string, data: unknown): Promise<Submission> {
  await delay(latency * 1.5);
  const u = currentUser();
  const ds = DATASETS.find((d) => d.code === dataset_code);
  if (!ds) throw new ApiError('Набір даних не знайдено.', 404, { detail: 'Набір даних не знайдено.' });
  const request_id = nextId('req');
  if (!can(u.role, ds.code, 'submit')) {
    appendAudit({ request_id, user_email: u.email, role: u.role, action: 'dataset.submit', dataset_code, outcome: 'denied', reason_code: 'NO_ROLE_PERMISSION' });
    save();
    throw new ApiError('Роль не має права подавати цей набір.', 403, { detail: 'Роль не має права подавати цей набір.', reason_code: 'NO_ROLE_PERMISSION', request_id });
  }
  const v = validateRecords(ds.kind, data);
  const sub: Submission = {
    submission_id: `SUB-${String(getDb().submissions.length + 7).padStart(4, '0')}`, dataset_code, file_name, records: v.total,
    valid_ratio: v.total ? v.validCount / v.total : 0, state: v.valid ? 'accepted' : 'rejected', created_at: new Date().toISOString(), request_id, errors: v.valid ? undefined : v.errors,
  };
  getDb().submissions.unshift(sub);
  appendAudit({ request_id, user_email: u.email, role: u.role, action: 'dataset.submit', dataset_code, outcome: v.valid ? 'approved' : 'invalid', reason_code: v.valid ? 'OK' : 'VALIDATION_FAILED', details: { file_name, records: v.total, errors: v.errors.length } });
  save();
  if (!v.valid) throw new ApiError('Файл не пройшов перевірку JSON Schema. Дані не прийнято.', 422, { detail: 'Файл не пройшов перевірку JSON Schema. Дані не прийнято.', reason_code: 'VALIDATION_FAILED', request_id, errors: v.errors });
  return sub;
}

export async function listSubmissions(): Promise<Submission[]> {
  await delay(latency / 2);
  requireRole(currentUser(), ['carrier', 'admin']);
  return getDb().submissions;
}

/* ---------------- Журнал аудиту ---------------- */

export async function listAuditEvents(f: AuditFilters = {}): Promise<AuditEvent[]> {
  await delay(latency / 2);
  requireRole(currentUser(), ['admin', 'auditor']);
  const q = f.q?.trim().toLowerCase();
  return getDb().audit.filter((e) =>
    (!f.from || e.occurred_at >= f.from) && (!f.to || e.occurred_at <= f.to) && (!f.outcome || e.outcome === f.outcome) && (!f.role || e.role === f.role) && (!f.dataset || e.dataset_code === f.dataset) &&
    (!q || [e.id, e.request_id, e.user_email, e.action, e.dataset_code, e.reason_code].some((x) => x?.toLowerCase().includes(q))),
  );
}

export async function logAuditExport(count: number) {
  const u = currentUser();
  appendAudit({ request_id: null, user_email: u.email, role: u.role, action: 'audit.export', dataset_code: null, outcome: 'info', reason_code: 'OK', details: { rows: count, format: 'csv' } });
  save();
}

export function logAuth(email: string, role: Role | 'system', ok: boolean) {
  appendAudit({ request_id: null, user_email: email, role, action: ok ? 'auth.login' : 'auth.login_failed', dataset_code: null, outcome: ok ? 'info' : 'denied', reason_code: ok ? 'OK' : 'UNAUTHENTICATED' });
  save();
}

export { resetDb };
