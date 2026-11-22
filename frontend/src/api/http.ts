/** Тонка обгортка над fetch: базова адреса, JSON, токен, зрозумілі помилки. */

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';
export const USE_MOCK: boolean = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
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
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
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
    // FastAPI повертає { detail: "..." } або { detail: [{ msg }] }
    const detail = (data as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
          ? String(detail[0].msg)
          : (STATUS_MESSAGES[res.status] ?? `Помилка ${res.status}`);
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
