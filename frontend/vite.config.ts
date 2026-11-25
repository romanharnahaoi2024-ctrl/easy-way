/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy для збірки (захист від XSS): скрипти лише з власного домену,
 * запити — лише до власного домену й адреси API, зображення — ще й тайли мапи.
 * У режимі розробки не додається, бо Vite вбудовує службові inline-скрипти.
 */
function csp(apiUrl: string): Plugin {
  let api = '';
  try {
    api = new URL(apiUrl).origin;
  } catch {
    /* відносна адреса API — вистачає 'self' */
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.basemaps.cartocdn.com",
    "font-src 'self' data:",
    `connect-src 'self'${api ? ' ' + api : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'easyway-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    plugins: [react(), csp(env.VITE_API_URL ?? 'http://localhost:8000')],
    server: { port: 5173 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
