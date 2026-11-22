/**
 * Демо-дані для роботи без бекенду. Маршрут M1, зупинки й BUS-01 узято з docs/demo/demo_data.json,
 * решту маршрутів додано для наочності мапи.
 */
import type { Role } from '../../config/roles';
import type { Classification, Dataset, Route, TransitMode } from '../types';

export const ROUTES: (Route & { mode: TransitMode })[] = [
  {
    code: 'M1', direction: 'Вокзал → Парк', name: 'Маршрут M1', mode: 'bus',
    stops: [
      { id: 's-m1-1', name: 'Вокзал', lat: 49.8408, lon: 23.9931, order: 1 },
      { id: 's-m1-2', name: 'Площа', lat: 49.8417, lon: 24.022, order: 2 },
      { id: 's-m1-3', name: 'Парк', lat: 49.8309, lon: 24.0269, order: 3 },
    ],
  },
  {
    code: 'Т6', direction: 'Вокзал → Погулянка', name: 'Трамвай 6', mode: 'tram',
    stops: [
      { id: 's-t6-1', name: 'Вокзал', lat: 49.8395, lon: 23.9945, order: 1 },
      { id: 's-t6-2', name: 'вул. Городоцька', lat: 49.8406, lon: 24.006, order: 2 },
      { id: 's-t6-3', name: 'Оперний театр', lat: 49.8439, lon: 24.0262, order: 3 },
      { id: 's-t6-4', name: 'пл. Ринок', lat: 49.8418, lon: 24.0316, order: 4 },
      { id: 's-t6-5', name: 'вул. Личаківська', lat: 49.8381, lon: 24.0452, order: 5 },
      { id: 's-t6-6', name: 'Погулянка', lat: 49.8302, lon: 24.0561, order: 6 },
    ],
  },
  {
    code: 'Т2', direction: 'Сихів → пл. Ринок', name: 'Трамвай 2', mode: 'tram',
    stops: [
      { id: 's-t2-1', name: 'Сихів', lat: 49.7982, lon: 24.0561, order: 1 },
      { id: 's-t2-2', name: 'вул. Стрийська', lat: 49.8151, lon: 24.0282, order: 2 },
      { id: 's-t2-3', name: 'Політехніка', lat: 49.8355, lon: 24.0141, order: 3 },
      { id: 's-t2-4', name: 'пл. Міцкевича', lat: 49.8396, lon: 24.0301, order: 4 },
      { id: 's-t2-5', name: 'пл. Ринок', lat: 49.8418, lon: 24.0316, order: 5 },
    ],
  },
  {
    code: 'Тр25', direction: 'Левандівка → Личаків', name: 'Тролейбус 25', mode: 'trolleybus',
    stops: [
      { id: 's-tr25-1', name: 'Левандівка', lat: 49.852, lon: 23.9601, order: 1 },
      { id: 's-tr25-2', name: 'просп. Шевченка', lat: 49.8468, lon: 23.9902, order: 2 },
      { id: 's-tr25-3', name: 'пл. Петрушевича', lat: 49.8369, lon: 24.0241, order: 3 },
      { id: 's-tr25-4', name: 'Личаків', lat: 49.8349, lon: 24.0702, order: 4 },
    ],
  },
  {
    code: 'А46', direction: 'Рясне → Політехніка', name: 'Автобус 46', mode: 'bus',
    stops: [
      { id: 's-a46-1', name: 'Рясне', lat: 49.8738, lon: 23.9502, order: 1 },
      { id: 's-a46-2', name: 'вул. Шевченка', lat: 49.8531, lon: 23.9802, order: 2 },
      { id: 's-a46-3', name: 'Вокзал', lat: 49.8397, lon: 23.995, order: 3 },
      { id: 's-a46-4', name: 'Політехніка', lat: 49.8356, lon: 24.0139, order: 4 },
    ],
  },
];

/** Транспорт: фаза на маршруті (0…1), тривалість кола в секундах, стан GPS */
export const VEHICLES = [
  { fleet_code: 'BUS-01', route: 'M1', phase: 0.35, loop: 900, low_floor: true },
  { fleet_code: '1124', route: 'Т6', phase: 0.52, loop: 1500, low_floor: true },
  { fleet_code: '1131', route: 'Т6', phase: 0.12, loop: 1500, low_floor: false },
  { fleet_code: '1087', route: 'Т2', phase: 0.3, loop: 1300, low_floor: true },
  { fleet_code: '1102', route: 'Т2', phase: 0.78, loop: 1300, low_floor: false },
  { fleet_code: '3021', route: 'Тр25', phase: 0.45, loop: 1400, low_floor: true },
  { fleet_code: 'A46-07', route: 'А46', phase: 0.6, loop: 1100, low_floor: true },
  // Збій GPS: остання позиція надійшла 75 с тому → клієнт позначає її як застарілу (NFR-02)
  { fleet_code: 'A46-12', route: 'А46', phase: 0.2, loop: 1100, low_floor: false, staleSeconds: 75 },
];

export const DATASETS: (Dataset & { classification: Classification; title: string })[] = [
  { code: 'gps-demo', kind: 'gps', schema_version: '1.0', requires_consent: true, classification: 'internal', title: 'GPS-позиції транспорту (реальний час)', owner: 'КП «Електротранс»', description: 'Останні координати бортів, час спостереження, швидкість.' },
  { code: 'schedule-gtfs', kind: 'schedule', schema_version: '1.2', requires_consent: false, classification: 'public', title: 'Розклад руху (GTFS)', owner: 'КП «Електротранс»', description: 'Час прибуття й відправлення на зупинках за рейсами.' },
  { code: 'stops', kind: 'stops', schema_version: '1.0', requires_consent: false, classification: 'public', title: 'Зупинки та маршрути', owner: 'Департамент мобільності', description: 'Перелік зупинок із координатами й порядком на маршруті.' },
  { code: 'incidents', kind: 'incidents', schema_version: '1.0', requires_consent: false, classification: 'internal', title: 'Інциденти на лінії', owner: 'Диспетчерська служба', description: 'Затримки, поломки, ремонтні роботи. У демо містить запис із помилкою координат.' },
  { code: 'occupancy', kind: 'occupancy', schema_version: '1.0', requires_consent: false, classification: 'confidential', title: 'Заповненість салонів', owner: 'КП «Електротранс»', description: 'Відсоток заповнення за даними датчиків.' },
  { code: 'driver-personal', kind: 'personal', schema_version: '1.0', requires_consent: true, classification: 'restricted', title: 'Персональні дані водіїв', owner: 'КП «Електротранс»', description: 'Персональні дані. Видаються лише за окремим рішенням.' },
];

/** dataset_permissions: роль × набір × дія */
export const PERMISSIONS: { role: Role; dataset: string; action: 'read' | 'submit' }[] = [
  ...(['consumer', 'carrier', 'admin'] as Role[]).map((role) => ({ role, dataset: 'gps-demo', action: 'read' as const })),
  ...(['consumer', 'carrier', 'admin', 'auditor'] as Role[]).flatMap((role) => [
    { role, dataset: 'schedule-gtfs', action: 'read' as const },
    { role, dataset: 'stops', action: 'read' as const },
  ]),
  ...(['consumer', 'carrier', 'admin'] as Role[]).map((role) => ({ role, dataset: 'incidents', action: 'read' as const })),
  { role: 'admin', dataset: 'occupancy', action: 'read' },
  { role: 'admin', dataset: 'driver-personal', action: 'read' },
  ...['gps-demo', 'schedule-gtfs', 'stops', 'incidents', 'occupancy'].map((dataset) => ({ role: 'carrier' as Role, dataset, action: 'submit' as const })),
];

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  public: 'Публічні',
  internal: 'Внутрішні',
  confidential: 'Конфіденційні',
  restricted: 'Обмежені',
};
