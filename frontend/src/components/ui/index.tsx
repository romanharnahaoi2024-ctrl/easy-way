import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff, Route } from 'lucide-react';
import './ui.css';

/* ---------- Button ---------- */
type ButtonType = 'primary' | 'secondary' | 'ghost' | 'danger' | 'lime';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonType;
  size?: 'm' | 'l';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}
export function Button({ variant = 'primary', size = 'm', icon, loading, block, children, className = '', disabled, ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size === 'l' && 'btn--l', block && 'btn--block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ---------- TextField ---------- */
interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: string;
  /** Показує кнопку «показати / приховати пароль» */
  revealable?: boolean;
}
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, icon, error, hint, revealable, type = 'text', id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const [revealed, setRevealed] = useState(false);
  const message = error ?? hint;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__control">
        {icon}
        <input
          ref={ref}
          id={inputId}
          type={revealable && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? hintId : undefined}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            className="field__trailing"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Приховати пароль' : 'Показати пароль'}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {message && (
        <p id={hintId} className="field__hint" role={error ? 'alert' : undefined}>
          {message}
        </p>
      )}
    </div>
  );
});

/* ---------- Badge ---------- */
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'lime';
export function Badge({ tone = 'neutral', dot = true, live, children }: { tone?: BadgeTone; dot?: boolean; live?: boolean; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}${live ? ' badge--live' : ''}`}>
      {dot && <span className="badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

/** Класи даних із дизайн-системи */
export const CLASSIFICATION_TONE = {
  Публічні: 'success',
  Внутрішні: 'info',
  Конфіденційні: 'warning',
  Обмежені: 'danger',
} as const satisfies Record<string, BadgeTone>;

/* ---------- Checkbox ---------- */
export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

/* ---------- Logo ---------- */
export function Logo({ dark }: { dark?: boolean }) {
  return (
    <span className={`logo${dark ? ' logo--dark' : ''}`}>
      <span className="logo__mark" aria-hidden>
        <Route size={20} strokeWidth={2.2} />
      </span>
      EasyWay
    </span>
  );
}

/* ---------- Avatar ---------- */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden>
      {initials(name)}
    </span>
  );
}
