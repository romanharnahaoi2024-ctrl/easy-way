import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CloudUpload, Download, FileJson, Send, TriangleAlert } from 'lucide-react';
import { getVehiclePositions, listDatasets, listSubmissions, submitDataset } from '../api/data';
import { ApiError } from '../api/http';
import type { Submission, VehiclePosition } from '../api/types';
import { validateRecords, type ValidationResult } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button } from '../components/ui';
import { Card, ErrorState, Notice } from '../components/ui/blocks';
import { useApi, useNow, usePolling } from '../lib/hooks';
import { ago, fmtDateTime, fmtNum, fmtPct } from '../lib/format';
import { POLL_MS, isStale } from './MapPage';
import './screens.css';

const SUBMITTABLE = ['gps-demo', 'schedule-gtfs', 'stops', 'incidents', 'occupancy'];
const MAX_BYTES = 50 * 1024 * 1024;

/** Приклади файлів для демонстрації: коректний і з помилками (lat = 95 — сценарій з DEMO_SCRIPT) */
export function sampleGps(broken: boolean) {
  const now = Date.now();
  const rows = [
    { fleet_code: 'BUS-01', route_code: 'M1', lat: 49.8412, lon: 24.0101, observed_at: new Date(now - 5000).toISOString(), speed_kmh: 22 },
    { fleet_code: '1124', route_code: 'Т6', lat: 49.8433, lon: 24.0238, observed_at: new Date(now - 4000).toISOString(), speed_kmh: 18 },
    { fleet_code: '1087', route_code: 'Т2', lat: 49.8201, lon: 24.0247, observed_at: new Date(now - 7000).toISOString(), speed_kmh: 25 },
    { fleet_code: '3021', route_code: 'Тр25', lat: 49.8402, lon: 24.0129, observed_at: new Date(now - 3000).toISOString(), speed_kmh: 16 },
    { fleet_code: 'A46-07', route_code: 'А46', lat: 49.8465, lon: 23.9876, observed_at: new Date(now - 6000).toISOString(), speed_kmh: 31 },
  ];
  if (broken) {
    rows[2] = { ...rows[2], lat: 95 };
    const { observed_at: _drop, ...noTime } = rows[4];
    void _drop;
    rows[4] = noTime as (typeof rows)[number];
  }
  return rows;
}

interface Picked {
  name: string;
  size: number;
  data: unknown;
  parseError?: string;
}

export function CarrierPage() {
  const { user } = useAuth();
  const datasets = useApi(listDatasets);
  const subs = useApi(listSubmissions);
  const [code, setCode] = useState('gps-demo');
  const [file, setFile] = useState<Picked | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string; sub?: Submission; requestId?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ds = datasets.data?.find((d) => d.code === code);
  const check: ValidationResult | null = file && !file.parseError && ds ? validateRecords(ds.kind, file.data) : null;

  async function readFile(f: File) {
    setServer(null);
    if (f.size > MAX_BYTES) return setFile({ name: f.name, size: f.size, data: null, parseError: 'Файл більший за 50 МБ.' });
    const text = await f.text();
    try {
      setFile({ name: f.name, size: f.size, data: JSON.parse(text) });
    } catch {
      setFile({ name: f.name, size: f.size, data: null, parseError: 'Файл не є коректним JSON.' });
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  };
  const pickSample = (broken: boolean) => {
    setCode('gps-demo');
    setServer(null);
    const data = sampleGps(broken);
    setFile({ name: broken ? 'gps_z_pomylkoyu.json' : 'gps_korektnyi.json', size: JSON.stringify(data).length, data });
  };
  const downloadSample = (broken: boolean) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(sampleGps(broken), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = broken ? 'gps_z_pomylkoyu.json' : 'gps_korektnyi.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  async function send() {
    if (!file || file.parseError) return;
    setBusy(true);
    try {
      const s = await submitDataset(code, file.name, file.data);
      setServer({ tone: 'success', text: `Подання ${s.submission_id} прийнято: ${fmtNum(s.records)} записів.`, sub: s, requestId: s.request_id });
    } catch (e) {
      const ae = e instanceof ApiError ? e : null;
      setServer({ tone: ae?.status === 422 ? 'warning' : 'danger', text: `HTTP ${ae?.status ?? '—'} · ${ae?.message ?? 'Не вдалося надіслати файл.'}`, requestId: ae?.body?.request_id ?? undefined });
    } finally {
      setBusy(false);
      void subs.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Подання даних"
        subtitle={`UC-05 · ${user?.organization ?? ''} · файл перевіряється за JSON Schema перед надсиланням і повторно на сервері`}
        actions={
          <>
            <Button variant="secondary" icon={<Download size={18} aria-hidden />} onClick={() => downloadSample(false)}>
              Шаблон JSON
            </Button>
            <Badge tone="primary">EZW-52</Badge>
          </>
        }
      />
      <div className="cr-grid">
        <div className="cr-col">
          <Card title="Нове подання" subtitle="Розклади, зупинки, GPS-позиції, інциденти" id="upload">
            <div className="form-row">
              <label htmlFor="ds">Набір даних</label>
              <select id="ds" className="select" value={code} onChange={(e) => { setCode(e.target.value); setServer(null); }}>
                {(datasets.data ?? []).filter((d) => SUBMITTABLE.includes(d.code)).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.title} ({d.code}, схема v{d.schema_version})
                  </option>
                ))}
              </select>
            </div>
            <div className={`drop${over ? ' drop--over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <span className="drop__icon">
                <CloudUpload size={24} aria-hidden />
              </span>
              <span className="drop__text">
                <span className="t-title-s">Перетягніть файл сюди або оберіть на комп’ютері</span>
                <span className="t-body-s muted">JSON-масив записів · до 50 МБ · UTF-8</span>
              </span>
              <Button variant="secondary" onClick={() => input.current?.click()}>
                Обрати файл
              </Button>
              <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} aria-label="Файл набору даних" />
            </div>
            <div className="samples">
              Для демонстрації:
              <Button variant="ghost" onClick={() => pickSample(false)}>
                Коректний GPS-файл
              </Button>
              <Button variant="ghost" onClick={() => pickSample(true)}>
                GPS-файл з помилкою (lat = 95)
              </Button>
            </div>
            {file && (
              <div className="file-row">
                <span className={`file-row__icon${file.parseError || (check && !check.valid) ? ' file-row__icon--bad' : ''}`}>
                  <FileJson size={18} aria-hidden />
                </span>
                <div>
                  <p className="mono">{file.name}</p>
                  <p className="t-body-s muted">{(file.size / 1024).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} КБ</p>
                </div>
                {file.parseError ? <Badge tone="danger">Не JSON</Badge> : check?.valid ? <Badge tone="success">Схема OK</Badge> : <Badge tone="warning">Є помилки</Badge>}
              </div>
            )}
          </Card>

          <Card title="Історія подань" pad={false} id="subs" actions={<Button variant="ghost" onClick={() => void subs.reload()}>Оновити</Button>}>
            {subs.error && <ErrorState message={subs.error} onRetry={subs.reload} />}
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Подання</th>
                    <th>Набір</th>
                    <th>Дата</th>
                    <th>Записів</th>
                    <th>Якість</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.data?.map((s) => (
                    <tr key={s.submission_id}>
                      <td>
                        <span className="mono">{s.submission_id}</span>
                        <span className="sub">{s.file_name}</span>
                      </td>
                      <td>{datasets.data?.find((d) => d.code === s.dataset_code)?.title ?? s.dataset_code}</td>
                      <td>{fmtDateTime(s.created_at)}</td>
                      <td>{fmtNum(s.records)}</td>
                      <td>{fmtPct(s.valid_ratio)}</td>
                      <td>{s.state === 'accepted' ? <Badge tone="success">Прийнято</Badge> : <Badge tone="danger">Відхилено</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="cr-col">
          <Card title="Перевірка файлу" subtitle={ds ? `JSON Schema «${ds.kind}» v${ds.schema_version}` : 'JSON Schema'} id="check" actions={check && (check.valid ? <Badge tone="success">Без помилок</Badge> : <Badge tone="warning">{`${check.errors.length} помилок`}</Badge>)}>
            {!file && <p className="t-body-s muted">Оберіть файл — перевірка почнеться одразу, ще до надсилання.</p>}
            {file?.parseError && <Notice tone="danger">{file.parseError}</Notice>}
            {check && (
              <>
                <div className="stat-grid">
                  <div className="stat">
                    <span className="t-body-s muted">Записів</span>
                    <b>{fmtNum(check.total)}</b>
                  </div>
                  <div className="stat">
                    <span className="t-body-s muted">Валідних</span>
                    <b className={check.valid ? 'ok' : 'warn'}>{check.total ? fmtPct(check.validCount / check.total) : '—'}</b>
                  </div>
                </div>
                {check.errors.length > 0 && (
                  <ul className="issues" aria-label="Помилки перевірки">
                    {check.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>
                        <span className="mono">
                          <TriangleAlert size={12} aria-hidden /> запис {e.row ?? '—'}
                          {e.path ? ` · ${e.path}` : ''}
                        </span>
                        {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {server && (
              <Notice tone={server.tone}>
                {server.text}
                {server.requestId && (
                  <>
                    <br />
                    <span className="mono">request_id: {server.requestId}</span> · подію записано в журнал аудиту
                  </>
                )}
              </Notice>
            )}
            <Button size="l" block loading={busy} disabled={!file || Boolean(file.parseError)} icon={<Send size={18} aria-hidden />} onClick={send}>
              Надіслати на сервер
            </Button>
            {check && !check.valid && <p className="t-body-s muted">Файл із помилками можна надіслати: сервер повторить перевірку й поверне 422 — так перевіряється негативний сценарій.</p>}
          </Card>
          <GpsStream />
        </div>
      </div>
    </>
  );
}

function GpsStream() {
  const [pos, setPos] = useState<VehiclePosition[]>([]);
  const [hist, setHist] = useState<number[]>([]);
  const now = useNow(1000);
  const load = async () => {
    try {
      const p = await getVehiclePositions();
      setPos(p);
      const fresh = Math.min(...p.map((x) => (Date.now() - Date.parse(x.observed_at)) / 1000));
      setHist((h) => [...h.slice(-23), Math.max(0.5, fresh)]);
    } catch {
      /* показуємо останні дані */
    }
  };
  useEffect(() => {
    void load();
  }, []);
  usePolling(load, POLL_MS);
  const online = pos.filter((p) => !isStale(p, now));
  const latest = pos.reduce<string | null>((m, p) => (!m || p.observed_at > m ? p.observed_at : m), null);
  const max = Math.max(1, ...hist);
  const pts = hist.map((v, i) => `${(i / Math.max(1, hist.length - 1)) * 360},${56 - (v / max) * 46}`).join(' ');
  return (
    <section className="gps-card" aria-label="Потік GPS">
      <div className="gps-card__head">
        <div>
          <h2 className="t-title-m">Потік GPS</h2>
          <p className="t-body-s">Опитування кожні {POLL_MS / 1000} с</p>
        </div>
        <Badge tone="lime" live>
          LIVE
        </Badge>
      </div>
      <div className="gps-big">
        <b>{online.length}</b>
        <span className="t-body-s">/ {pos.length} бортів з актуальною позицією</span>
      </div>
      <p className="t-label-s">Затримка надходження свіжої позиції, с</p>
      {hist.length < 3 && <div className="gps-wait">Графік з’явиться після кількох опитувань</div>}
      <svg className="spark" viewBox="0 0 360 56" preserveAspectRatio="none" aria-hidden style={{ display: hist.length < 3 ? 'none' : undefined }}>
        {hist.length > 1 && (
          <>
            <polygon points={`0,56 ${pts} 360,56`} fill="#C8F25A" fillOpacity="0.12" />
            <polyline points={pts} fill="none" stroke="#C8F25A" strokeWidth="2" strokeLinejoin="round" />
          </>
        )}
      </svg>
      <div className="gps-metrics">
        <div>
          Остання позиція<b>{latest ? ago(latest, now) : '—'}</b>
        </div>
        <div>
          Застарілі<b>{pos.length - online.length}</b>
        </div>
        <div>
          Поріг<b>30 с</b>
        </div>
      </div>
    </section>
  );
}
