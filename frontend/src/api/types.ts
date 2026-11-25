import type { Role } from '../config/roles';

/* ---------- Автентифікація ---------- */
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  organization: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/* ---------- Транспорт (ER: routes, stops, route_stops, vehicles, gps_positions) ---------- */
export type TransitMode = 'tram' | 'trolleybus' | 'bus';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  order: number;
}

export interface Route {
  code: string;
  direction: string;
  name: string;
  /** Необов’язкове поле: якщо бекенд не надсилає, клієнт визначає за кодом */
  mode?: TransitMode;
  stops: Stop[];
}

export interface VehiclePosition {
  fleet_code: string;
  route_code: string | null;
  lat: number;
  lon: number;
  /** ISO 8601 з часовим поясом */
  observed_at: string;
  low_floor?: boolean;
}

/* ---------- Набори даних і керований обмін ---------- */
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface Dataset {
  code: string;
  kind: string;
  schema_version: string;
  requires_consent: boolean;
  title?: string;
  classification?: Classification;
  owner?: string;
  description?: string;
}

export type RequestState = 'pending' | 'approved' | 'denied' | 'invalid';
/** Коди причин — як у журналі аудиту на сервері (узгоджено з П4 25.11.2026) */
export type ReasonCode = 'OK' | 'UNAUTHENTICATED' | 'NO_ROLE_PERMISSION' | 'NO_CONSENT' | 'CONSENT_REVOKED' | 'VALIDATION_FAILED';

export interface ExchangePayload {
  dataset_code: string;
  action: 'read';
  purpose: string;
  period_from?: string;
  period_to?: string;
}

export interface ExchangeResult {
  request_id: string;
  state: 'approved';
  dataset_code: string;
  records: Record<string, unknown>[];
  total: number;
  masked_fields: string[];
}

export interface ExchangeRequest {
  request_id: string;
  dataset_code: string;
  action: string;
  state: RequestState;
  reason_code: ReasonCode;
  created_at: string;
  finished_at?: string;
  purpose?: string;
  user_email?: string;
}

/** Тіло відповіді 403 / 422 від API обміну */
export interface ApiErrorBody {
  detail: string;
  reason_code?: ReasonCode;
  /** null для 401: запит не створюється */
  request_id?: string | null;
  errors?: ValidationIssue[];
}

export interface ValidationIssue {
  /** Номер запису в наборі (з 1) */
  row?: number;
  path: string;
  message: string;
}

/* ---------- Згода (ER: consents) ---------- */
export interface Consent {
  id: string;
  user_email: string;
  dataset_code: string;
  granted_at: string;
  valid_until: string;
  revoked_at: string | null;
}

/* ---------- Подання даних перевізником ---------- */
export interface Submission {
  submission_id: string;
  dataset_code: string;
  file_name: string;
  records: number;
  valid_ratio: number;
  state: 'accepted' | 'rejected';
  created_at: string;
  request_id: string;
  errors?: ValidationIssue[];
}

/* ---------- Журнал аудиту (ER: audit_events) ---------- */
export type AuditOutcome = 'approved' | 'denied' | 'invalid' | 'info';

export interface AuditEvent {
  id: string;
  request_id: string | null;
  occurred_at: string;
  user_email: string;
  /** unknown — сервер не надіслав роль користувача */
  role: Role | 'system' | 'unknown';
  action: string;
  dataset_code: string | null;
  outcome: AuditOutcome;
  reason_code: ReasonCode | string;
  details?: Record<string, unknown>;
  hash?: string;
  prev_hash?: string;
}

/** Запис GET /audit у тому вигляді, як його віддає сервер (EZW-42) */
export interface AuditEventRaw {
  id: string | number;
  request_id: string | null;
  occurred_at: string;
  outcome: AuditOutcome;
  reason_code: ReasonCode | string;
  /** null для подій без запиту */
  user_id?: string | number | null;
  dataset?: string | null;
  // Необов'язкові поля, якщо сервер їх додасть
  user_email?: string;
  role?: Role | 'system';
  action?: string;
  dataset_code?: string | null;
  details?: Record<string, unknown>;
  hash?: string;
  prev_hash?: string;
}

export interface AuditFilters {
  from?: string;
  to?: string;
  outcome?: AuditOutcome | '';
  role?: Role | 'system' | '';
  dataset?: string;
  q?: string;
}
