import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, CloudUpload, Map, ScrollText, ShieldCheck } from 'lucide-react';

/**
 * Ролі системи. Коди збігаються з демо-набором команди (docs/demo/demo_data.json: role "consumer").
 * consumer — пасажир / споживач даних з UC-02…UC-06.
 */
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
  consumer: 'мапа, запити, згоди',
  admin: 'політики й обмін',
  auditor: 'журнал дій',
};

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Хто бачить пункт меню і може відкрити сторінку */
  roles: Role[];
  ticket: string;
  /** Прецеденти з розділу вимог */
  uc: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/map', label: 'Мапа транспорту', icon: Map, roles: ['carrier', 'consumer', 'admin', 'auditor'], ticket: 'EZW-49', uc: 'UC-02' },
  { path: '/exchange', label: 'Обмін даними', icon: ArrowLeftRight, roles: ['consumer', 'carrier', 'admin'], ticket: 'EZW-50', uc: 'UC-06' },
  { path: '/consents', label: 'Згоди', icon: ShieldCheck, roles: ['consumer', 'admin'], ticket: 'EZW-51', uc: 'UC-03, UC-04' },
  { path: '/carrier', label: 'Подання даних', icon: CloudUpload, roles: ['carrier'], ticket: 'EZW-52', uc: 'UC-05' },
  { path: '/audit', label: 'Журнал аудиту', icon: ScrollText, roles: ['admin', 'auditor'], ticket: 'EZW-53', uc: 'UC-07' },
];

/** Куди вести користувача одразу після входу */
export const HOME_BY_ROLE: Record<Role, string> = {
  carrier: '/carrier',
  consumer: '/map',
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
