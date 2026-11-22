import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Database, FileJson, Lock, Minus, Send, ShieldCheck, X } from 'lucide-react';
import { createExchangeRequest, listDatasets, listMyRequests } from '../api/data';
import { ApiError } from '../api/http';
import type { Dataset, ExchangeResult, ReasonCode } from '../api/types';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button } from '../components/ui';
import { Card, ErrorState, Notice, Skeleton } from '../components/ui/blocks';
import { useApi } from '../lib/hooks';
import { CLASSIFICATION, fmtDateTime, REASON, toInputDate } from '../lib/format';
import './screens.css';

type StepStatus = 'idle' | 'run' | 'done' | 'fail' | 'skip';

/** 7 кроків керованого обміну — як у діаграмі послідовності (розділ 4.6 звіту) */
export const STEPS = [
  { title: 'Подати запит', hint: 'Клієнт надсилає POST /exchange/requests' },
  { title: 'Зареєструвати', hint: 'Сервер створює запис і видає request_id' },
  { title: 'Перевірити роль', hint: 'Чи має роль право read на набір' },
  { title: 'Перевірити згоду', hint: 'Якщо політика набору вимагає згоди' },
  { title: 'Перевірити якість', hint: 'JSON Schema: повнота, формат, координати' },
  { title: 'Зафіксувати', hint: 'Статус і подія аудиту — в одній транзакції' },
  { title: 'Відповісти', hint: '200 — видано · 403 — відмова · 422 — помилка даних' },
];

interface Outcome {
  http: number;
  reason: ReasonCode;
  message: string;
  request_id?: string;
  result?: ExchangeResult;
  errors?: { row?: number; path: string; message: string }[];
}

/** Підсумковий стан кожного кроку за відповіддю сервера */
export function stepsFor(o: Outcome, requiresConsent: boolean): StepStatus[] {
  const consent: StepStatus = requiresConsent ? 'done' : 'skip';
  switch (o.reason) {
    case 'OK':
      return ['done', 'done', 'done', consent, 'done', 'done', 'done'];
    case 'NO_PERMISSION':
      return ['done', 'done', 'fail', 'idle', 'idle', 'done', 'fail'];
    case 'NO_CONSENT':
      return ['done', 'done', 'done', 'fail', 'idle', 'done', 'fail'];
    case 'INVALID_DATA':
      return ['done', 'done', 'done', consent, 'fail', 'done', 'fail'];
    default:
      return ['fail', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle'];
  }
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ExchangePage() {
  const datasets = useApi(listDatasets);
  const history = useApi(listMyRequests);
  const [code, setCode] = useState('gps-demo');
  const [purpose, setPurpose] = useState('Аналіз пунктуальності маршрутів для звіту департаменту');
  const today = new Date();
  const [from, setFrom] = useState(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(toInputDate(today));
  const [purposeError, setPurposeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepStatus[]>(Array(7).fill('idle'));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const timer = useRef<number[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => timer.current.forEach(clearTimeout), []);
  const ds = datasets.data?.find((d) => d.code === code);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (purpose.trim().length < 10) {
      setPurposeError('Опишіть мету використання (щонайменше 10 символів) — вона потрапить у журнал аудиту.');
      return;
    }
    setPurposeError(null);
    setBusy(true);
    setOutcome(null);
    timer.current.forEach(clearTimeout);
    setSteps(['run', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle']);
    let o: Outcome;
    try {
      const result = await createExchangeRequest({ dataset_code: code, action: 'read', purpose: purpose.trim(), period_from: from, period_to: to });
      o = { http: 200, reason: 'OK', message: `Набір видано: ${result.total} записів.`, request_id: result.request_id, result };
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      if (!ae) console.error(err);
      o = { http: ae?.status ?? 0, reason: (ae?.body?.reason_code ?? 'UNAUTHENTICATED') as ReasonCode, message: ae?.message ?? 'Невідома помилка.', request_id: ae?.body?.request_id, errors: ae?.body?.errors };
    }
    const final = stepsFor(o, Boolean(ds?.requires_consent));
    const gap = reduceMotion() ? 0 : 260;
    final.forEach((_, i) => {
      timer.current.push(
        window.setTimeout(() => {
          // кроки 0…i вже мають підсумок, наступний (якщо він виконується) — «run»
          setSteps(final.map((s, j) => (j <= i ? s : j === i + 1 && s !== 'idle' ? 'run' : 'idle')));
          if (i === final.length - 1) {
            setSteps(final);
            setOutcome(o);
            setBusy(false);
            void history.reload();
            setTimeout(() => resultRef.current?.focus(), 30);
          }
        }, gap * (i + 1)),
      );
    });
  }

  return (
    <>
      <PageHeader title="Обмін даними" subtitle="UC-06 · запит на набір проходить 7 кроків перевірки на сервері, кожен результат фіксується в журналі аудиту" actions={<Badge tone="primary">EZW-50</Badge>} />
      <div className="ex-grid">
        <div className="ex-main">
          <Card title="1. Оберіть набір даних" subtitle="Каталог наборів із класом даних і вимогою згоди" id="catalog">
            {datasets.error && <ErrorState message={datasets.error} onRetry={datasets.reload} />}
            {datasets.loading && !datasets.data ? (
              <Skeleton rows={3} />
            ) : (
              <div className="ds-grid" role="radiogroup" aria-label="Набір даних">
                {datasets.data?.map((d) => (
                  <DatasetOption key={d.code} d={d} selected={d.code === code} onSelect={() => setCode(d.code)} />
                ))}
              </div>
            )}
          </Card>

          <Card title="2. Опишіть запит" subtitle="Мета й період потрапляють у запис аудиту" id="form">
            <form className="ex-form" onSubmit={onSubmit} noValidate>
              <div className="form-row">
                <label htmlFor="purpose">Мета використання</label>
                <textarea id="purpose" className="textarea" value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-invalid={purposeError ? true : undefined} aria-describedby={purposeError ? 'purpose-err' : undefined} />
                {purposeError && (
                  <p id="purpose-err" className="field__hint err" role="alert">
                    {purposeError}
                  </p>
                )}
              </div>
              <div className="form-grid-2">
                <div className="form-row">
                  <label htmlFor="from">Період з</label>
                  <input id="from" type="date" className="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="form-row">
                  <label htmlFor="to">по</label>
                  <input id="to" type="date" className="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <div className="ex-submit">
                <p className="t-body-s muted">
                  Набір: <b>{ds?.title ?? code}</b>
                  {ds?.requires_consent && ' · потрібна ваша чинна згода'}
                </p>
                <Button type="submit" size="l" loading={busy} disabled={!ds} icon={<Send size={18} aria-hidden />}>
                  {busy ? 'Перевіряємо…' : 'Надіслати запит'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="ex-side">
          <Card title="Перевірки на сервері" subtitle="Кроки сценарію керованого обміну" id="steps">
            <ol className="steps" aria-label="Кроки обміну">
              {STEPS.map((s, i) => (
                <li key={s.title} className={`step step--${steps[i]}`} aria-current={steps[i] === 'run' ? 'step' : undefined}>
                  <span className="step__marker" aria-hidden>
                    {steps[i] === 'done' ? <Check size={15} /> : steps[i] === 'fail' ? <X size={15} /> : steps[i] === 'skip' ? <Minus size={15} /> : i + 1}
                  </span>
                  <span className="step__text">
                    <span className="t-label-s step__cap">Крок {i + 1}</span>
                    <span className="step__title">{s.title}</span>
                    <span className="t-body-s muted">{steps[i] === 'skip' ? 'Не потрібна для цього набору' : s.hint}</span>
                  </span>
                  <span className="sr-only">{{ idle: 'очікує', run: 'виконується', done: 'успішно', fail: 'не пройдено', skip: 'пропущено' }[steps[i]]}</span>
                </li>
              ))}
            </ol>
          </Card>

          <div ref={resultRef} tabIndex={-1} className="ex-result-anchor" aria-live="polite">
            {outcome && <ResultCard o={outcome} />}
          </div>
        </div>
      </div>

      <Card title="Мої запити" subtitle="Історія запитів поточного користувача" pad={false} id="history" className="ex-history">
        {history.error && <ErrorState message={history.error} onRetry={history.reload} />}
        {history.data && history.data.length === 0 ? (
          <p className="t-body-s muted ex-empty">Запитів ще немає. Оберіть набір і надішліть перший запит.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>request_id</th>
                  <th>Набір</th>
                  <th>Час</th>
                  <th>Мета</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.map((r) => (
                  <tr key={r.request_id}>
                    <td className="mono">{r.request_id}</td>
                    <td>{datasets.data?.find((d) => d.code === r.dataset_code)?.title ?? r.dataset_code}</td>
                    <td>{fmtDateTime(r.created_at)}</td>
                    <td className="ex-purpose">{r.purpose}</td>
                    <td>
                      <Badge tone={r.state === 'approved' ? 'success' : r.state === 'denied' ? 'danger' : r.state === 'invalid' ? 'warning' : 'neutral'}>
                        {r.state === 'approved' ? '200 · видано' : r.state === 'denied' ? `403 · ${r.reason_code === 'NO_CONSENT' ? 'немає згоди' : 'немає права'}` : r.state === 'invalid' ? '422 · помилка даних' : 'в обробці'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function DatasetOption({ d, selected, onSelect }: { d: Dataset; selected: boolean; onSelect: () => void }) {
  const cl = d.classification ? CLASSIFICATION[d.classification] : null;
  return (
    <button type="button" role="radio" aria-checked={selected} className={`ds-card${selected ? ' ds-card--sel' : ''}`} onClick={onSelect}>
      <span className="ds-card__icon">{d.classification === 'restricted' ? <Lock size={18} aria-hidden /> : <Database size={18} aria-hidden />}</span>
      <span className="ds-card__body">
        <span className="t-title-s">{d.title ?? d.code}</span>
        <span className="t-body-s muted">
          {d.owner} · <span className="mono">{d.code}</span>
        </span>
        <span className="ds-card__badges">
          {cl && <Badge tone={cl.tone}>{cl.label}</Badge>}
          {d.requires_consent && (
            <Badge tone="neutral" dot={false}>
              потрібна згода
            </Badge>
          )}
        </span>
      </span>
    </button>
  );
}

function ResultCard({ o }: { o: Outcome }) {
  const ok = o.http === 200;
  const tone = ok ? 'success' : o.http === 422 ? 'warning' : 'danger';
  return (
    <Card
      title={ok ? 'Дані видано' : o.http === 422 ? 'Дані не видано: помилка якості' : 'Запит відхилено'}
      actions={<Badge tone={tone}>{`HTTP ${o.http || '—'}`}</Badge>}
      id="result"
    >
      <dl className="kv">
        <dt>request_id</dt>
        <dd className="mono">{o.request_id ?? '—'}</dd>
        <dt>Причина</dt>
        <dd>{REASON[o.reason] ?? o.reason}</dd>
        <dt>Аудит</dt>
        <dd>
          <Clock size={13} aria-hidden /> подію записано
        </dd>
      </dl>
      {!ok && <Notice tone={tone === 'warning' ? 'warning' : 'danger'}>{o.message}</Notice>}
      {o.reason === 'NO_CONSENT' && (
        <Link className="btn btn--secondary" to="/consents">
          <ShieldCheck size={18} aria-hidden /> Перейти до згод
        </Link>
      )}
      {o.errors && o.errors.length > 0 && (
        <ul className="issues">
          {o.errors.slice(0, 4).map((e, i) => (
            <li key={i}>
              <span className="mono">
                запис {e.row ?? '—'} · {e.path || '—'}
              </span>
              {e.message}
            </li>
          ))}
        </ul>
      )}
      {ok && o.result && (
        <>
          {o.result.masked_fields.length > 0 && <Notice tone="info">Замасковано: {o.result.masked_fields.join('; ')}</Notice>}
          <div>
            <p className="t-label-s muted ex-preview-cap">
              <FileJson size={14} aria-hidden /> Перші записи ({Math.min(3, o.result.records.length)} з {o.result.total})
            </p>
            <JsonPreview value={o.result.records.slice(0, 3)} />
          </div>
        </>
      )}
    </Card>
  );
}

export function JsonPreview({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const parts = text.split(/("[\w-]+")(?=:)/g);
  return (
    <pre className="code-block" tabIndex={0} aria-label="Попередній перегляд JSON">
      {parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="k">{p}</span> : p))}
    </pre>
  );
}
