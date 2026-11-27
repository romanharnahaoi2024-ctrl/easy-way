import type { BadgeTone } from '../components/ui';
import type { AuditOutcome, Classification, ReasonCode } from '../api/types';

const TZ = 'Europe/Kyiv';

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('uk-UA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} с тому`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} хв тому`;
  return `${Math.round(m / 60)} год тому`;
}

export const fmtNum = (n: number) => n.toLocaleString('uk-UA');
export const fmtPct = (r: number) => `${(r * 100).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} %`;

export const CLASSIFICATION: Record<Classification, { label: string; tone: BadgeTone }> = {
  public: { label: 'Публічні', tone: 'success' },
  internal: { label: 'Внутрішні', tone: 'info' },
  confidential: { label: 'Конфіденційні', tone: 'warning' },
  restricted: { label: 'Обмежені', tone: 'danger' },
};

export const OUTCOME: Record<AuditOutcome, { label: string; tone: BadgeTone }> = {
  approved: { label: 'Дозволено', tone: 'success' },
  denied: { label: 'Відмовлено', tone: 'danger' },
  invalid: { label: 'Помилка даних', tone: 'warning' },
  info: { label: 'Подія', tone: 'neutral' },
};

export const REASON: Record<ReasonCode | string, string> = {
  OK: 'Успішно',
  NO_ROLE_PERMISSION: 'Роль не має права на цю дію',
  NO_CONSENT: 'Немає чинної згоди',
  CONSENT_REVOKED: 'Згоду відкликано',
  VALIDATION_FAILED: 'Дані не пройшли перевірку JSON Schema',
  UNAUTHENTICATED: 'Невдала автентифікація',
};

export const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Вхід у систему',
  'auth.login_failed': 'Невдалий вхід',
  'exchange.request': 'Запит на обмін',
  'audit.event': 'Подія без запиту',
  'consent.grant': 'Надання згоди',
  'consent.revoke': 'Відкликання згоди',
  'dataset.submit': 'Подання набору',
  'quality.validate': 'Перевірка якості',
  'policy.update': 'Зміна політики',
  'audit.export': 'Експорт журналу',
};

/** Дата для <input type="date"> (локальна) */
export const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
