import { useMemo, useState } from 'react';
import { Activity, ArrowLeftRight, Ban, Download, Fingerprint, RefreshCw, Search, TriangleAlert, X } from 'lucide-react';
import { listAuditEvents, listDatasets, logAuditExport } from '../api/data';
import type { AuditEvent, AuditFilters, AuditOutcome } from '../api/types';
import { ROLE_LABELS, type Role } from '../config/roles';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button } from '../components/ui';
import { Card, ErrorState, Kpi, Skeleton } from '../components/ui/blocks';
import { useApi, usePolling } from '../lib/hooks';
import { ACTION_LABEL, fmtDate, fmtDateTime, fmtTime, OUTCOME, REASON, toInputDate } from '../lib/format';
import { JsonPreview } from './ExchangePage';
import './screens.css';

const PAGE = 10;

/** Перевірка ланцюжка: prev_hash кожної події дорівнює hash попередньої (старішої) */
export function chainIntact(events: AuditEvent[]) {
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].prev_hash && events[i + 1].hash && events[i].prev_hash !== events[i + 1].hash) return false;
  }
  return true;
}

export function toCsv(rows: AuditEvent[]) {
  const head = ['id', 'occurred_at', 'user_email', 'role', 'action', 'dataset_code', 'outcome', 'reason_code', 'request_id'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [head.join(';'), ...rows.map((r) => head.map((h) => esc(r[h as keyof AuditEvent])).join(';'))].join('\r\n');
}

export function AuditPage() {
  const [day, setDay] = useState(toInputDate(new Date()));
  const [outcome, setOutcome] = useState<AuditOutcome | ''>('');
  const [role, setRole] = useState<Role | 'system' | ''>('');
  const [dataset, setDataset] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string | null>(null);

  const filters: AuditFilters = useMemo(() => {
    const from = day ? new Date(`${day}T00:00:00`).toISOString() : undefined;
    const to = day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined;
    return { from, to, outcome, role, dataset: dataset || undefined, q: q || undefined };
  }, [day, outcome, role, dataset, q]);

  const events = useApi(() => listAuditEvents(filters), [filters]);
  const all = useApi(() => listAuditEvents({}), []);
  const datasets = useApi(listDatasets);
  usePolling(() => {
    void events.reload();
    void all.reload();
  }, 15_000);

  const rows = events.data ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const selected = rows.find((r) => r.id === sel) ?? null;
  const todayEvents = (all.data ?? []).filter((e) => fmtDate(e.occurred_at) === fmtDate(new Date().toISOString()));
  const intact = chainIntact(all.data ?? []);
  const reset = () => {
    setDay(toInputDate(new Date()));
    setOutcome('');
    setRole('');
    setDataset('');
    setQ('');
    setPage(0);
  };

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `easyway-audit-${day || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void logAuditExport(rows.length).then(() => all.reload());
  }

  return (
    <>
      <PageHeader
        title="Журнал аудиту"
        subtitle="UC-07 · незмінний журнал: хто, коли, які дані, результат і причина"
        actions={
          <>
            <Badge tone={intact ? 'success' : 'danger'}>{intact ? 'Ланцюжок цілісний' : 'Ланцюжок порушено'}</Badge>
            <Button variant="secondary" icon={<Download size={18} aria-hidden />} onClick={exportCsv} disabled={rows.length === 0}>
              Експорт CSV
            </Button>
          </>
        }
      />
      <div className="kpi-row">
        <Kpi icon={<Activity size={20} />} tone="primary" label="Подій сьогодні" value={todayEvents.length} />
        <Kpi icon={<Ban size={20} />} tone="danger" label="Відмов у доступі" value={todayEvents.filter((e) => e.outcome === 'denied').length} />
        <Kpi icon={<ArrowLeftRight size={20} />} tone="info" label="Запитів на обмін" value={todayEvents.filter((e) => e.action === 'exchange.request').length} />
        <Kpi icon={<TriangleAlert size={20} />} tone="warning" label="Помилок даних" value={todayEvents.filter((e) => e.outcome === 'invalid').length} />
      </div>

      <div className="au-filters" role="search" aria-label="Фільтри журналу">
        <div className="form-row">
          <label htmlFor="f-day">Дата</label>
          <input id="f-day" type="date" className="date" value={day} onChange={(e) => { setDay(e.target.value); setPage(0); }} />
        </div>
        <div className="form-row">
          <label htmlFor="f-role">Роль</label>
          <select id="f-role" className="select" value={role} onChange={(e) => { setRole(e.target.value as Role | 'system' | ''); setPage(0); }}>
            <option value="">Усі ролі</option>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
            <option value="system">Система</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="f-out">Результат</label>
          <select id="f-out" className="select" value={outcome} onChange={(e) => { setOutcome(e.target.value as AuditOutcome | ''); setPage(0); }}>
            <option value="">Усі</option>
            {(Object.keys(OUTCOME) as AuditOutcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME[o].label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="f-ds">Набір</label>
          <select id="f-ds" className="select" value={dataset} onChange={(e) => { setDataset(e.target.value); setPage(0); }}>
            <option value="">Усі набори</option>
            {datasets.data?.map((d) => (
              <option key={d.code} value={d.code}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row au-search">
          <label htmlFor="f-q">Пошук</label>
          <div className="field__control">
            <Search size={16} aria-hidden />
            <input id="f-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ID події, request_id, email" />
          </div>
        </div>
        <div className="au-filters__btns">
          <Button variant="ghost" icon={<X size={16} aria-hidden />} onClick={reset}>
            Скинути
          </Button>
          <Button variant="ghost" icon={<RefreshCw size={16} aria-hidden />} onClick={() => void events.reload()} aria-label="Оновити журнал" />
        </div>
      </div>

      <div className="au-grid">
        <Card pad={false} id="events" className="au-table">
          {events.error && <ErrorState message={events.error} onRetry={events.reload} />}
          {events.loading && !events.data ? (
            <div style={{ padding: '0 20px' }}>
              <Skeleton rows={6} />
            </div>
          ) : rows.length === 0 ? (
            <p className="t-body-s muted ex-empty">За цими фільтрами подій немає.</p>
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="tbl" aria-label="Події журналу аудиту">
                  <thead>
                    <tr>
                      <th>Час</th>
                      <th>Користувач</th>
                      <th>Дія</th>
                      <th>Набір</th>
                      <th>Результат</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.map((e) => (
                      <tr
                        key={e.id}
                        data-clickable
                        tabIndex={0}
                        aria-selected={sel === e.id}
                        className={e.outcome === 'denied' ? 'au-row-denied' : undefined}
                        onClick={() => setSel(e.id)}
                        onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), setSel(e.id))}
                      >
                        <td className="mono">{fmtTime(e.occurred_at)}</td>
                        <td>
                          {e.user_email}
                          <span className="sub">{e.role === 'system' ? 'Система' : ROLE_LABELS[e.role]}</span>
                        </td>
                        <td>
                          {ACTION_LABEL[e.action] ?? e.action}
                          <span className="sub mono">{e.action}</span>
                        </td>
                        <td className="mono">{e.dataset_code ?? '—'}</td>
                        <td>
                          <Badge tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav className="pager" aria-label="Сторінки журналу">
                <span>
                  Показано {page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} з {rows.length}
                </span>
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Попередня сторінка">
                  ‹
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} type="button" aria-current={i === page ? 'page' : undefined} onClick={() => setPage(i)}>
                    {i + 1}
                  </button>
                ))}
                <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Наступна сторінка">
                  ›
                </button>
              </nav>
            </>
          )}
        </Card>

        <Card title={selected ? `Подія #${selected.id}` : 'Деталі події'} subtitle={selected ? fmtDateTime(selected.occurred_at) : 'Оберіть рядок у таблиці'} actions={selected && <Badge tone={OUTCOME[selected.outcome].tone}>{OUTCOME[selected.outcome].label}</Badge>} id="detail">
          {selected ? (
            <>
              <dl className="kv">
                <dt>Суб’єкт</dt>
                <dd>{selected.user_email}</dd>
                <dt>Роль</dt>
                <dd>{selected.role === 'system' ? 'Система' : ROLE_LABELS[selected.role]}</dd>
                <dt>Дія</dt>
                <dd className="mono">{selected.action}</dd>
                <dt>Набір</dt>
                <dd>{selected.dataset_code ?? '—'}</dd>
                <dt>request_id</dt>
                <dd className="mono">{selected.request_id ?? '—'}</dd>
                <dt>Причина</dt>
                <dd>
                  <span className="mono">{selected.reason_code}</span> — {REASON[selected.reason_code] ?? ''}
                </dd>
              </dl>
              {selected.details && <JsonPreview value={selected.details} />}
              <div className="chain">
                <div className="chain__head">
                  <Fingerprint size={16} aria-hidden />
                  <span>Ланцюжок контрольних сум</span>
                  <Badge tone={intact ? 'success' : 'danger'}>{intact ? 'Цілісний' : 'Порушено'}</Badge>
                </div>
                <p className="mono">prev {selected.prev_hash ?? '—'}</p>
                <p className="mono">hash {selected.hash ?? '—'}</p>
              </div>
            </>
          ) : (
            <p className="t-body-s muted">Тут з’являться суб’єкт, дія, request_id, код причини й контрольна сума події.</p>
          )}
        </Card>
      </div>
    </>
  );
}
