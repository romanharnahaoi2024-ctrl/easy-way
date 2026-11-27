/** Тонка обгортка над fetch: базова адреса, JSON, токен, зрозумілі помилки. */
import type { ApiErrorBody, ReasonCode } from './types';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
/** Константа збірки: при VITE_USE_MOCK=false увесь демо-код (зокрема демо-паролі) не потрапляє в бандл */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken() {
  return authToken;
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Некоректний запит.',
  401: 'Невірна електронна пошта або пароль.',
  403: 'Недостатньо прав для цієї дії.',
  404: 'Ресурс не знайдено.',
  422: 'Дані не пройшли перевірку.',
  429: 'Забагато спроб. Спробуйте пізніше.',
  500: 'Помилка сервера. Спробуйте ще раз.',
};

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Немає зв’язку з сервером. Перевірте мережу або адресу API.', 0);
  }

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    const body = (data && typeof data === 'object' ? data : {}) as ApiErrorBody & { detail?: unknown };
    // FastAPI: { detail: "..." } або { detail: [{ loc, msg }] } для 422 від pydantic
    const detail = body.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && (detail[0] as { msg?: string })?.msg
          ? String((detail[0] as { msg: string }).msg)
          : (STATUS_MESSAGES[res.status] ?? `Помилка ${res.status}`);
    const reason_code = (body.reason_code as ReasonCode | undefined) ?? reasonFromStatus(res.status, message);
    // request_id від сервера — число; у клієнті всюди працюємо з рядком
    const request_id = body.request_id === null || body.request_id === undefined ? body.request_id : String(body.request_id);
    const shown = humanMessage(message, res.status, reason_code);
    throw new ApiError(shown, res.status, { ...body, detail: message, reason_code, request_id, errors: Array.isArray(body.errors) ? body.errors : [] });
  }
  return data as T;
}

/** Відомі англійські тексти помилок сервера (EZW-42) */
const SERVER_DETAILS: Record<string, string> = {
  'invalid credentials': 'Невірна електронна пошта або пароль.',
  'account locked': 'Обліковий запис тимчасово заблоковано після кількох невдалих спроб входу. Спробуйте пізніше.',
  'not found': 'Сервер ще не підтримує цю дію або ресурс не знайдено.',
};
/** Пояснення для користувача за кодом причини, якщо сервер надіслав технічний текст англійською */
const REASON_DETAILS: Record<string, string> = {
  UNAUTHENTICATED: 'Сесія завершилась або токен недійсний. Увійдіть знову.',
  NO_ROLE_PERMISSION: 'Ваша роль не має права на цю дію з набором даних.',
  NO_CONSENT: 'Немає чинної згоди на обробку цього набору даних.',
  CONSENT_REVOKED: 'Згоду на обробку цього набору даних відкликано.',
  VALIDATION_FAILED: 'Дані з джерела не пройшли перевірку JSON Schema, тому не видані.',
};

/** Текст для користувача: українська з сервера як є, англійська — замінюється зрозумілим поясненням */
export function humanMessage(detail: string, status: number, reason?: string): string {
  if (/[а-щьюяєіїґ]/i.test(detail)) return detail;
  const known = SERVER_DETAILS[detail.trim().toLowerCase()];
  if (known) return known;
  if (reason && REASON_DETAILS[reason]) return REASON_DETAILS[reason];
  return STATUS_MESSAGES[status] ?? detail;
}

/**
 * Код причини, якщо сервер його не надіслав: визначаємо за HTTP-статусом.
 * 403 зі словом «згод»/consent у тексті вважаємо відмовою через згоду.
 */
export function reasonFromStatus(status: number, detail?: string): ReasonCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status === 403) return /згод|consent/i.test(detail ?? '') ? 'NO_CONSENT' : 'NO_ROLE_PERMISSION';
  return 'UNAUTHENTICATED';
}

/** Обидві причини зупиняють запит на кроці 4 («Перевірити згоду») */
export const isConsentReason = (r?: string | null) => r === 'NO_CONSENT' || r === 'CONSENT_REVOKED';

export function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
