import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { HOME_BY_ROLE, NAV_ITEMS, ROLE_LABELS, rolesFor } from '../config/roles';
import { Badge } from '../components/ui';
import './pages.css';

/** Негативний сценарій «без прав» (макет 07 у Figma). Сервер так само відповідає 403 і пише подію в журнал аудиту. */
export function ForbiddenPage() {
  const { user } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  const target = NAV_ITEMS.find((i) => i.path === from);
  const required = rolesFor(from);
  if (!user) return null;

  return (
    <div className="forbidden">
      <section className="card forbidden__card" aria-labelledby="forbidden-title">
        <span className="forbidden__icon">
          <ShieldAlert size={32} aria-hidden />
        </span>
        <p className="t-overline forbidden__code">Помилка 403 · Доступ заборонено</p>
        <h1 id="forbidden-title" className="t-h1">
          У вас немає прав на цей розділ
        </h1>
        <p className="secondary">
          Роль «{ROLE_LABELS[user.role]}» не може відкрити {target ? `розділ «${target.label}»` : 'цю сторінку'}. Сервер фіксує такі спроби в журналі
          аудиту.
        </p>
        <dl className="forbidden__facts">
          <div>
            <dt>Розділ</dt>
            <dd>
              {target ? target.label : from || '—'} {target && <Badge tone="neutral" dot={false}>{target.ticket}</Badge>}
            </dd>
          </div>
          <div>
            <dt>Ваша роль</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt>Потрібна роль</dt>
            <dd>{required.length ? required.map((r) => ROLE_LABELS[r]).join(' або ') : '—'}</dd>
          </div>
        </dl>
        <div className="forbidden__actions">
          <Link className="btn btn--primary" to={HOME_BY_ROLE[user.role]}>
            <ArrowLeft size={18} aria-hidden /> До мого робочого простору
          </Link>
          <a className="btn btn--secondary" href="mailto:data-admin@easyway.lviv.ua?subject=Запит%20на%20доступ">
            Подати запит на доступ
          </a>
        </div>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="forbidden">
      <section className="card forbidden__card">
        <p className="t-overline forbidden__code">Помилка 404</p>
        <h1 className="t-h1">Сторінку не знайдено</h1>
        <p className="secondary">Перевірте адресу або поверніться на головну.</p>
        <div className="forbidden__actions">
          <Link className="btn btn--primary" to="/">
            На головну
          </Link>
        </div>
      </section>
    </div>
  );
}
