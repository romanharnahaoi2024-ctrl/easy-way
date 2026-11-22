import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { canAccess } from '../config/roles';
import { useAuth } from './AuthContext';
import { FullScreenLoader } from '../components/ui/FullScreenLoader';

/** Пускає лише авторизованих; перевіряє, чи дозволено ролі відкривати сторінку (RBAC на клієнті). */
export function RequireAuth() {
  const { user, restoring } = useAuth();
  const location = useLocation();

  if (restoring) return <FullScreenLoader label="Відновлюємо сесію…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!canAccess(user.role, location.pathname)) {
    return <Navigate to="/403" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
