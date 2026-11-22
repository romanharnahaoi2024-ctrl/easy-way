import './ui.css';

export function FullScreenLoader({ label = 'Завантаження…' }: { label?: string }) {
  return (
    <div className="fs-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
