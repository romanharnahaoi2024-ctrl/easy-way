import { useEffect, useRef, type ReactNode } from 'react';
import { CircleAlert, RefreshCw, X } from 'lucide-react';
import { Button } from './index';
import './blocks.css';

export function Card({ title, subtitle, actions, children, className = '', pad = true, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={`card blk-card${pad ? '' : ' blk-card--flush'} ${className}`} aria-labelledby={id && title ? `${id}-t` : undefined}>
      {(title || actions) && (
        <header className="blk-card__head">
          <div>
            {title && (
              <h2 id={id ? `${id}-t` : undefined} className="t-title-m">
                {title}
              </h2>
            )}
            {subtitle && <p className="t-body-s muted">{subtitle}</p>}
          </div>
          {actions && <div className="blk-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ icon, tone, label, value }: { icon: ReactNode; tone: 'primary' | 'success' | 'warning' | 'danger' | 'info'; label: string; value: ReactNode }) {
  return (
    <div className="card kpi">
      <span className={`kpi__icon kpi__icon--${tone}`}>{icon}</span>
      <div>
        <p className="t-body-s muted">{label}</p>
        <p className="kpi__value">{value}</p>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="blk-error" role="alert">
      <CircleAlert size={18} aria-hidden />
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} icon={<RefreshCw size={16} aria-hidden />}>
          Повторити
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="blk-skeleton" aria-busy="true" aria-label="Завантаження">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

/** Доступне модальне вікно: фокус усередині, Esc закриває */
export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="blk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card blk-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={ref}>
        <header className="blk-dialog__head">
          <h2 id="dlg-title" className="t-title-m">
            {title}
          </h2>
          <button className="blk-x" type="button" onClick={onClose} aria-label="Закрити">
            <X size={18} />
          </button>
        </header>
        <div className="blk-dialog__body">{children}</div>
        <footer className="blk-dialog__foot">{footer}</footer>
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`blk-notice blk-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon}
      <div>{children}</div>
    </div>
  );
}
