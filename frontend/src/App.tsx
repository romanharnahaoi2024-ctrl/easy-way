import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/layout/AppLayout';
import { HOME_BY_ROLE } from './config/roles';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { ExchangePage } from './pages/ExchangePage';
import { ConsentPage } from './pages/ConsentPage';
import { CarrierPage } from './pages/CarrierPage';
import { AuditPage } from './pages/AuditPage';
import { ForbiddenPage, NotFoundPage } from './pages/ForbiddenPage';

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/consents" element={<ConsentPage />} />
          <Route path="/carrier" element={<CarrierPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
