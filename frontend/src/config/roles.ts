import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, CloudUpload, Map, ScrollText, ShieldCheck } from 'lucide-react';

/** Ролі системи. Мають збігатися з ролями бекенду (П4, EZW-40) і матрицею доступу (П3, EZW-26). */
export type Role = 'carrier' | 'consumer' | 'admin' | 'auditor';

export const ROLES: Role[] = ['carrier', 'consumer', 'admin', 'auditor'];

export const ROLE_LABELS: Record<Role, string> = {
  carrier: 'Перевізник',
  consumer: 'Споживач даних',
  admin: 'Адміністратор даних',
  auditor: 'Аудитор',
};

export const ROLE_HINTS: Record<Role, string> = {
  carrier: 'розклади й GPS',
  consumer: 'запит наборів',
  admin: 'погодження',
  auditor: 'журнал дій',
};

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Хто бачить пункт меню і може відкрити сторінку */
  roles: Role[];
  /** Задача в Jira, у якій буде реалізовано екран */
  ticket: string;
  due: string;
  summary: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/map',
    label: 'Мапа транспорту',
    icon: Map,
    roles: ['carrier', 'consumer', 'admin', 'auditor'],
    ticket: 'EZW-49',
    due: '18.11',
    summary: 'Мапа з маршрутами, транспортом у реальному часі, фільтрами за видом транспорту й низькопідлоговістю.',
  },
  {
    path: '/exchange',
    label: 'Обмін даними',
    icon: ArrowLeftRight,
    roles: ['consumer', 'admin'],
    ticket: 'EZW-50',
    due: '19.11',
    summary: 'Запит на набір даних і 7 кроків керованого обміну: набір → мета й поля → права ролі → згода → погодження → якість і маскування → видача й аудит.',
  },
  {
    path: '/consents',
    label: 'Згоди',
    icon: ShieldCheck,
    roles: ['carrier', 'admin'],
    ticket: 'EZW-51',
    due: '19.11',
    summary: 'Керування згодою власника даних: кому, на які поля й на який строк дозволено використання; відкликання.',
  },
  {
    path: '/carrier',
    label: 'Подання даних',
    icon: CloudUpload,
    roles: ['carrier'],
    ticket: 'EZW-52',
    due: '20.11',
    summary: 'Панель перевізника: завантаження розкладів (JSON/GTFS), перевірка за JSON Schema, стан потоку GPS, історія подань.',
  },
  {
    path: '/audit',
    label: 'Журнал аудиту',
    icon: ScrollText,
    roles: ['admin', 'auditor'],
    ticket: 'EZW-53',
    due: '20.11',
    summary: 'Незмінний журнал усіх дій із фільтрами, деталями події та перевіркою ланцюжка хешів.',
  },
];

/** Куди вести користувача одразу після входу */
export const HOME_BY_ROLE: Record<Role, string> = {
  carrier: '/carrier',
  consumer: '/exchange',
  admin: '/exchange',
  auditor: '/audit',
};

export function canAccess(role: Role, path: string): boolean {
  const item = NAV_ITEMS.find((i) => path === i.path || path.startsWith(i.path + '/'));
  return item ? item.roles.includes(role) : true;
}

export function rolesFor(path: string): Role[] {
  return NAV_ITEMS.find((i) => i.path === path)?.roles ?? [];
}

export const FIGMA_URL = 'https://www.figma.com/design/aqaGUoEIyp1rjWfN42P1in';
