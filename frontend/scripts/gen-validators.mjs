// Генерує src/api/validators.gen.js — попередньо скомпільовані валідатори JSON Schema.
// Потрібно, щоб у браузері не виконувався new Function (CSP без 'unsafe-eval').
import { readFileSync, writeFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const schemas = JSON.parse(readFileSync(new URL('../src/api/schemas.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } });
addFormats(ajv);
for (const [id, s] of Object.entries(schemas)) ajv.addSchema(s, id);
const map = Object.fromEntries(Object.keys(schemas).map((k) => [k, k]));
// Ajv навіть в ESM-режимі лишає require() для форматів і ucs2length — замінюємо їх
// на явні ESM-залежності (іменований імпорт з CJS однаково працює у Vite, Vitest і Node).
const DEPS = {
  'ajv-formats/dist/formats': "import { fullFormats as __fullFormats } from 'ajv-formats/dist/formats.js';\nconst __formats = { fullFormats: __fullFormats };",
  // ucs2length — довжина рядка в кодових точках Unicode (як рахує JSON Schema)
  'ajv/dist/runtime/ucs2length': 'const __ucs2 = { default: (s) => Array.from(s).length };',
};
const NAMES = { 'ajv-formats/dist/formats': '__formats', 'ajv/dist/runtime/ucs2length': '__ucs2' };
const used = new Set();
const body = standaloneCode(ajv, map)
  .replace(/^"use strict";/, '')
  .replace(/require\("([^"]+)"\)/g, (_, mod) => {
    if (!NAMES[mod]) throw new Error('Невідома залежність валідатора: ' + mod);
    used.add(mod);
    return NAMES[mod];
  });
const head = [...used].map((m) => DEPS[m]).join('\n');
const code = '// Згенеровано scripts/gen-validators.mjs — не редагувати вручну.\n/* eslint-disable */\n' + head + '\n' + body;
writeFileSync(new URL('../src/api/validators.gen.js', import.meta.url), code);
console.log('validators.gen.js:', Object.keys(map).join(', '));
