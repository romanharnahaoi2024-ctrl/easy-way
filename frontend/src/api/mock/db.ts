/**
 * Стан демо-сервера в пам’яті браузера (зберігається в sessionStorage, щоб переживати перезавантаження).
 * Кожна дія, яку на справжньому сервері фіксує журнал аудиту, тут теж додає подію.
 */
import type { Role } from '../../config/roles';
import type { AuditEvent, AuditOutcome, Consent, ExchangeRequest, ReasonCode, Submission } from '../types';

const KEY = 'easyway.mockdb.v2';

export interface MockDb {
  consents: Consent[];
  requests: ExchangeRequest[];
  submissions: Submission[];
  audit: AuditEvent[];
  seq: number;
}

let db: MockDb | null = null;

/** FNV-1a: коротка детермінована контрольна сума для демо-ланцюжка журналу й маскування */
export function fnv(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;

function seed(): MockDb {
  const d: MockDb = {
    consents: [
      { id: 'CN-2026-014', user_email: 'i.melnyk@easyway.lviv.ua', dataset_code: 'gps-demo', granted_at: '2026-11-01T09:00:00+02:00', valid_until: '2026-12-31T23:59:59+02:00', revoked_at: null },
      { id: 'CN-2026-009', user_email: 'adtarget@partner.example', dataset_code: 'gps-demo', granted_at: '2026-10-01T10:00:00+03:00', valid_until: '2027-01-31T23:59:59+02:00', revoked_at: '2026-11-12T16:20:00+02:00' },
      { id: 'CN-2026-011', user_email: 'analytics@city.lviv.ua', dataset_code: 'gps-demo', granted_at: '2026-10-20T12:00:00+03:00', valid_until: '2026-11-30T23:59:59+02:00', revoked_at: null },
    ],
    requests: [],
    submissions: [
      { submission_id: 'SUB-0007', dataset_code: 'schedule-gtfs', file_name: 'rozklad_lystopad_v2.json', records: 12377, valid_ratio: 0.914, state: 'rejected', created_at: '2026-11-03T11:05:00+02:00', request_id: 'req_0071' },
      { submission_id: 'SUB-0008', dataset_code: 'stops', file_name: 'zupynky_v12.json', records: 1318, valid_ratio: 1, state: 'accepted', created_at: '2026-11-10T16:40:00+02:00', request_id: 'req_0094' },
      { submission_id: 'SUB-0009', dataset_code: 'occupancy', file_name: 'zapovnenist_v7.json', records: 48900, valid_ratio: 0.987, state: 'accepted', created_at: '2026-11-18T08:00:00+02:00', request_id: 'req_0122' },
    ],
    audit: [],
    seq: 130,
  };
  db = d;
  const seedEvents: [number, string, Role | 'system', string, string | null, AuditOutcome, ReasonCode | string][] = [
    [190, 'a.tkach@easyway.lviv.ua', 'auditor', 'auth.login', null, 'info', 'OK'],
    [176, 'o.boiko@easyway.lviv.ua', 'carrier', 'dataset.submit', 'schedule-gtfs', 'approved', 'OK'],
    [164, 'system', 'system', 'quality.validate', 'schedule-gtfs', 'approved', 'OK'],
    [150, 'm.hnatyshyn@easyway.lviv.ua', 'admin', 'policy.update', 'occupancy', 'info', 'OK'],
    [131, 'adtarget@partner.example', 'consumer', 'exchange.request', 'gps-demo', 'denied', 'NO_CONSENT'],
    [118, 'i.melnyk@easyway.lviv.ua', 'consumer', 'exchange.request', 'driver-personal', 'denied', 'NO_ROLE_PERMISSION'],
    [97, 'analytics@city.lviv.ua', 'consumer', 'exchange.request', 'gps-demo', 'approved', 'OK'],
    [80, 'o.boiko@easyway.lviv.ua', 'carrier', 'dataset.submit', 'gps-demo', 'invalid', 'VALIDATION_FAILED'],
    [61, 'analytics@city.lviv.ua', 'consumer', 'exchange.request', 'incidents', 'invalid', 'VALIDATION_FAILED'],
    [44, 'unknown@mail.example', 'system', 'auth.login_failed', null, 'denied', 'UNAUTHENTICATED'],
    [23, 'm.hnatyshyn@easyway.lviv.ua', 'admin', 'exchange.request', 'occupancy', 'approved', 'OK'],
  ];
  for (const [mins, email, role, action, ds, outcome, reason] of seedEvents) {
    const isReq = action.startsWith('exchange') || action.startsWith('dataset');
    appendAudit({ user_email: email, role, action, dataset_code: ds, outcome, reason_code: reason, request_id: isReq ? nextId('req') : null }, iso(mins * MIN));
  }
  return d;
}

export function getDb(): MockDb {
  if (db) return db;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      db = JSON.parse(raw) as MockDb;
      return db;
    }
  } catch {
    /* сховище недоступне — працюємо в пам’яті */
  }
  return seed();
}

export function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(getDb()));
  } catch {
    /* ігноруємо */
  }
}

export function resetDb() {
  db = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ігноруємо */
  }
  seed();
  save();
}

export function nextId(prefix: string) {
  const d = db ?? getDb();
  d.seq += 1;
  return `${prefix}_${String(d.seq).padStart(4, '0')}`;
}

export function appendAudit(e: Omit<AuditEvent, 'id' | 'occurred_at' | 'hash' | 'prev_hash'>, at = new Date().toISOString()): AuditEvent {
  const d = db ?? getDb();
  const prev = d.audit[0];
  const id = `A-${20900 + d.audit.length + 1}`;
  const prev_hash = prev?.hash ?? '0000000000000000';
  const ev: AuditEvent = { ...e, id, occurred_at: at, prev_hash };
  ev.hash = fnv(prev_hash + JSON.stringify({ ...ev, hash: undefined }));
  d.audit.unshift(ev);
  d.audit.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return ev;
}
