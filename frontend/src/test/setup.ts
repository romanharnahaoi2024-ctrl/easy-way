import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetDb } from '../api/mock/db';
import { setMockLatency } from '../api/mock/server';

beforeAll(() => setMockLatency(0));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  resetDb();
});

// Leaflet потребує справжнього браузера (SVG, розміри) — у jsdom підміняємо компоненти мапи заглушками.
// Мапу перевіряє наскрізний прогін у Chrome (e2e/run.py).
import { vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
vi.mock('react-leaflet', () => {
  const Box = ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'leaflet' }, children);
  const Nothing = () => null;
  const map = { zoomIn() {}, zoomOut() {}, setView() {}, fitBounds() {} };
  return { MapContainer: Box, TileLayer: Nothing, Polyline: Nothing, CircleMarker: Nothing, Marker: Nothing, Tooltip: Nothing, Pane: Box, useMap: () => map };
});
