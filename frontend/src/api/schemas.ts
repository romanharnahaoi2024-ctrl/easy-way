/**
 * JSON Schema наборів даних (NFR-05, UC-05).
 * Сервер — джерело істини; клієнт використовує ті самі схеми для попередньої перевірки файлу
 * перед надсиланням, щоб перевізник одразу бачив помилки.
 */
import type { ErrorObject } from 'ajv';
import type { ValidationIssue } from './types';
import SCHEMA_DEFS from './schemas.json';
// Валідатори попередньо скомпільовані (scripts/gen-validators.mjs, Ajv standalone),
// бо ajv.compile() використовує new Function, а CSP збірки забороняє 'unsafe-eval'.
import * as validators from './validators.gen.js';

type Validator = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };

export const SCHEMAS: Record<string, object> = SCHEMA_DEFS;
const compiled = validators as unknown as Record<string, Validator | undefined>;

const FIELD_MESSAGES: Record<string, (e: ErrorObject) => string> = {
  minimum: (e) => `значення менше за допустиме (мінімум ${(e.params as { limit: number }).limit})`,
  maximum: (e) => `значення більше за допустиме (максимум ${(e.params as { limit: number }).limit})`,
  required: (e) => `відсутнє обов’язкове поле «${(e.params as { missingProperty: string }).missingProperty}»`,
  type: (e) => `неправильний тип, очікується ${(e.params as { type: string }).type}`,
  format: (e) => `неправильний формат (${(e.params as { format: string }).format})`,
  pattern: () => 'неправильний формат часу, очікується ГГ:ХХ',
  enum: (e) => `допустимі значення: ${(e.params as { allowedValues: string[] }).allowedValues.join(', ')}`,
  additionalProperties: (e) => `зайве поле «${(e.params as { additionalProperty: string }).additionalProperty}»`,
  minItems: () => 'набір порожній',
  minLength: () => 'порожнє значення',
};

export interface ValidationResult {
  valid: boolean;
  total: number;
  validCount: number;
  errors: ValidationIssue[];
}

export function validateRecords(kind: string, data: unknown): ValidationResult {
  const schema = SCHEMAS[kind];
  if (!schema) return { valid: true, total: Array.isArray(data) ? data.length : 0, validCount: 0, errors: [] };
  const fn = compiled[kind];
  if (!fn) throw new Error(`Немає скомпільованого валідатора для «${kind}» — запустіть npm run gen:validators`);
  if (!Array.isArray(data)) {
    return { valid: false, total: 0, validCount: 0, errors: [{ path: '/', message: 'очікується масив записів (JSON array)' }] };
  }
  const ok = fn(data);
  const errors: ValidationIssue[] = [];
  const badRows = new Set<number>();
  for (const e of fn.errors ?? []) {
    const m = e.instancePath.match(/^\/(\d+)(.*)$/);
    const row = m ? Number(m[1]) + 1 : undefined;
    if (row) badRows.add(row);
    const field = m ? m[2].replace(/^\//, '') : e.instancePath;
    const msg = (FIELD_MESSAGES[e.keyword] ?? ((x: ErrorObject) => x.message ?? 'помилка'))(e);
    errors.push({ row, path: field || (e.keyword === 'required' ? '' : '/'), message: msg });
  }
  return { valid: Boolean(ok), total: data.length, validCount: data.length - badRows.size, errors: errors.slice(0, 50) };
}
