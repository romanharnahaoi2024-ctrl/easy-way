import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, CircleHelp, LogOut, Search, Settings } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { NAV_ITEMS, ROLE_LABELS } from '../../config/roles';
import { USE_MOCK } from '../../api/http';
import { Avatar, Badge, Logo } from '../ui';
import './layout.css';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));
  const roleLabel = ROLE_LABELS[user.role];

  const onLogout = () => {
    logout('manual');
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Головне меню">
        <div className="sidebar__logo">
          <Logo dark />
        </div>
        <nav className="sidebar__nav">
          <p className="sidebar__caption t-overline">Робочий простір</p>
          {items.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
              <Icon size={20} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__spacer" />
        <div className="sidebar__nav">
          <button className="nav-item" type="button" disabled title="З’явиться пізніше">
            <Settings size={20} aria-hidden />
            <span>Налаштування</span>
          </button>
          <a className="nav-item" href="https://www.figma.com/design/aqaGUoEIyp1rjWfN42P1in" target="_blank" rel="noreferrer">
            <CircleHelp size={20} aria-hidden />
            <span>Довідка (макети)</span>
          </a>
        </div>
        <div className="user-card">
          <Avatar name={user.full_name} />
          <div className="user-card__text">
            <p className="t-title-s user-card__name">{user.full_name}</p>
            <p className="t-body-s user-card__role">{roleLabel}</p>
          </div>
          <button className="icon-btn icon-btn--dark" type="button" onClick={onLogout} aria-label="Вийти з системи" title="Вийти">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <label className="topbar__search">
            <Search size={18} aria-hidden />
            <span className="sr-only">Пошук</span>
            <input placeholder="Пошук наборів, маршрутів, подій…" />
            <kbd>Ctrl K</kbd>
          </label>
          <div className="topbar__spacer" />
          {USE_MOCK ? <Badge tone="warning">Демо-дані</Badge> : <Badge tone="success">API · онлайн</Badge>}
          <button className="icon-btn" type="button" aria-label="Сповіщення">
            <Bell size={18} />
            <span className="icon-btn__dot" aria-hidden />
          </button>
          <span className="topbar__divider" aria-hidden />
          <div className="topbar__profile">
            <Avatar name={user.full_name} />
            <div>
              <p className="t-title-s">{user.full_name}</p>
              <p className="t-label-s muted">
                {roleLabel} · {user.organization}
              </p>
            </div>
            <ChevronDown size={16} className="muted" aria-hidden />
          </div>
        </header>
        <main className="content" id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
