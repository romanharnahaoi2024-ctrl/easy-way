import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BusFront, Database, Fingerprint, Lock, Mail, ScrollText, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { hasErrors, validateLogin, type LoginErrors } from '../auth/validation';
import { canAccess, HOME_BY_ROLE, ROLE_HINTS, ROLE_LABELS, type Role } from '../config/roles';
import { ApiError, USE_MOCK } from '../api/http';
import { DEMO_PASSWORD, DEMO_USERS } from '../api/mock';
import { Badge, Button, Checkbox, Logo, TextField } from '../components/ui';
import './login.css';

const ROLE_ICONS: Record<Role, LucideIcon> = { carrier: BusFront, consumer: Database, admin: ShieldCheck, auditor: ScrollText };

export function LoginPage() {
  const { user, login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [demoRole, setDemoRole] = useState<Role | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Після першої спроби перевіряємо поля «на льоту»
  useEffect(() => {
    if (submitted) setErrors(validateLogin(email, password));
  }, [email, password, submitted]);

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    clearNotice();
    const v = validateLogin(email, password);
    setErrors(v);
    if (hasErrors(v)) {
      (v.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      const u = await login({ email, password }, remember);
      const target = from && canAccess(u.role, from) ? from : HOME_BY_ROLE[u.role];
      navigate(target, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Не вдалося увійти. Спробуйте ще раз.');
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  function pickDemo(role: Role) {
    setDemoRole(role);
    setEmail(DEMO_USERS[role].email);
    setPassword(DEMO_PASSWORD);
    setServerError(null);
  }

  const onPasswordKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="login">
      <section className="login__brand" aria-label="Про EasyWay">
        <Logo dark />
        <div className="login__headline">
          <Badge tone="lime">МРія 2 · Проєктування ІС</Badge>
          <h1 className="t-display">
            Дані міського транспорту — <span className="lime">під контролем</span>
          </h1>
          <p>
            Платформа керованого обміну даними між перевізниками, містом і аналітиками: доступ за ролями, згода власника даних і повний журнал аудиту
            кожної дії.
          </p>
        </div>
        <RouteIllustration />
        <div className="login__footer">
          <ul className="login__features">
            <li>
              <ShieldCheck size={16} aria-hidden /> Доступ за ролями (RBAC)
            </li>
            <li>
              <Fingerprint size={16} aria-hidden /> Згода власника даних
            </li>
            <li>
              <ScrollText size={16} aria-hidden /> Аудит кожної дії
            </li>
          </ul>
          <p className="t-body-s">© 2026 EasyWay · команда «МРія 2», НУ «Львівська політехніка», ОІ-22</p>
        </div>
      </section>

      <section className="login__side">
        <div className="login__card card">
          <div className="login__heading">
            <h2 className="t-h1">Вхід до EasyWay</h2>
            <p className="secondary">Увійдіть, щоб працювати з даними відповідно до вашої ролі.</p>
          </div>

          {(serverError || notice) && (
            <div className="login__alert" role="alert">
              <TriangleAlert size={18} aria-hidden />
              <span>{serverError ?? notice}</span>
            </div>
          )}

          <form className="login__form" onSubmit={onSubmit} noValidate>
            <TextField
              ref={emailRef}
              label="Електронна пошта"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              placeholder="name@easyway.lviv.ua"
              icon={<Mail size={18} aria-hidden />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />
            <TextField
              ref={passwordRef}
              label="Пароль"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Щонайменше 8 символів"
              icon={<Lock size={18} aria-hidden />}
              revealable
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={onPasswordKey}
              error={errors.password}
              hint={capsLock ? 'Увімкнено Caps Lock' : undefined}
            />
            <div className="login__options">
              <Checkbox label="Запам’ятати мене" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <button type="button" className="link-btn" onClick={() => setForgotOpen((v) => !v)} aria-expanded={forgotOpen}>
                Забули пароль?
              </button>
            </div>
            {forgotOpen && (
              <p className="login__forgot t-body-s">
                Пароль скидає адміністратор даних вашої організації. Напишіть йому — він надішле посилання для зміни пароля.
              </p>
            )}
            <Button type="submit" size="l" block loading={loading} icon={<ArrowRight size={20} aria-hidden />}>
              {loading ? 'Входимо…' : 'Увійти'}
            </Button>
          </form>

          {USE_MOCK && (
            <>
              <div className="login__divider">
                <span>або демо-доступ за роллю</span>
              </div>
              <div className="login__roles" role="group" aria-label="Демо-доступ за роллю">
                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => {
                  const Icon = ROLE_ICONS[role];
                  return (
                    <button
                      key={role}
                      type="button"
                      className={`role-card${demoRole === role ? ' role-card--active' : ''}`}
                      onClick={() => pickDemo(role)}
                      aria-pressed={demoRole === role}
                    >
                      <span className="role-card__icon">
                        <Icon size={18} aria-hidden />
                      </span>
                      <span>
                        <span className="t-title-s">{role === 'consumer' ? 'Споживач' : role === 'admin' ? 'Адміністратор' : ROLE_LABELS[role]}</span>
                        <span className="t-body-s muted">{ROLE_HINTS[role]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <p className="login__note t-body-s muted">
            <Lock size={14} aria-hidden />
            Захищене з’єднання · JWT-сесія 30 хв · кожну спробу входу записано в журнал аудиту
          </p>
        </div>
        <p className="t-body-s muted login__below">Немає облікового запису? Зверніться до адміністратора даних вашої організації.</p>
      </section>
    </div>
  );
}

/** Ілюстрація маршрутів — та сама, що на макеті «01 — Вхід» у Figma */
function RouteIllustration() {
  const dots = [];
  for (let x = 12; x < 592; x += 28) for (let y = 10; y < 240; y += 28) dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1.2} fill="#93A0B8" fillOpacity={0.28} />);
  const routes: [string, string, number[][]][] = [
    ['#C8F25A', 'M 0 196 C 90 196 120 126 220 122 S 360 62 452 62 L 592 62', [[40, 196], [156, 150], [300, 96], [452, 62], [560, 62]]],
    ['#0F9F8F', 'M 0 58 C 96 58 150 150 254 158 S 420 214 592 206', [[64, 66], [180, 128], [254, 158], [392, 196], [520, 206]]],
    ['#7C5CFC', 'M 70 240 L 168 182 L 300 190 L 404 128 L 592 136', [[168, 182], [300, 190], [404, 128], [500, 132]]],
  ];
  return (
    <div className="route-art" aria-hidden>
      <svg viewBox="0 0 592 250" fill="none">
        {dots}
        {routes.map(([c, d]) => (
          <path key={d} d={d} stroke={c} strokeWidth={4} strokeLinecap="round" />
        ))}
        {routes.map(([c, , stops]) => stops.map(([x, y]) => <circle key={`${c}${x}`} cx={x} cy={y} r={6} fill="#0B1426" stroke={c} strokeWidth={3} />))}
      </svg>
      <span className="route-chip" style={{ left: '50.7%', top: '8.8%' }}>
        <i style={{ background: 'var(--brand-lime)' }} />
        Т6 · пл. Ринок · 2 хв
      </span>
      <span className="route-chip" style={{ left: '69%', top: '85%' }}>
        <i style={{ background: 'var(--transit-trolleybus)' }} />
        Тр 25 · 4 хв
      </span>
      <span className="route-chip" style={{ left: '20%', top: '80%' }}>
        <i style={{ background: 'var(--transit-bus)' }} />А 46 · онлайн
      </span>
    </div>
  );
}
