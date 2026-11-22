import { CalendarClock, ExternalLink, LayoutDashboard } from 'lucide-react';
import { FIGMA_URL, NAV_ITEMS, ROLE_LABELS } from '../config/roles';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui';
import './pages.css';

/**
 * Каркас екрана: маршрут, доступ за ролями й заголовок уже працюють,
 * вміст з’явиться у відповідній задачі тижня 2 (див. NAV_ITEMS).
 */
export function ScreenPlaceholder({ path }: { path: string }) {
  const item = NAV_ITEMS.find((i) => i.path === path)!;
  const Icon = item.icon;
  return (
    <>
      <PageHeader title={item.label} subtitle={item.summary} actions={<Badge tone="primary">{item.ticket}</Badge>} />
      <section className="card empty">
        <span className="empty__icon">
          <Icon size={28} aria-hidden />
        </span>
        <h2 className="t-h2">Екран у розробці</h2>
        <p className="secondary">
          Маршрут, меню й перевірка ролі вже працюють. Інтерфейс за макетом з’явиться в задачі <b>{item.ticket}</b>.
        </p>
        <div className="empty__meta">
          <span>
            <CalendarClock size={16} aria-hidden /> Термін {item.due}
          </span>
          <span>
            <LayoutDashboard size={16} aria-hidden /> Доступ: {item.roles.map((r) => ROLE_LABELS[r]).join(', ')}
          </span>
        </div>
        <a className="btn btn--secondary" href={FIGMA_URL} target="_blank" rel="noreferrer">
          <ExternalLink size={18} aria-hidden /> Відкрити макет у Figma
        </a>
      </section>
    </>
  );
}
