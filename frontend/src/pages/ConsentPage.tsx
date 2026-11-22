import { useState } from 'react';
import { Ban, CalendarClock, Clock, Info, Lock, MapPinned, ShieldCheck, ShieldOff } from 'lucide-react';
import { grantConsent, listConsents, listDatasets, revokeConsent } from '../api/data';
import { ApiError } from '../api/http';
import type { Consent, Dataset } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button, Checkbox } from '../components/ui';
import { Card, Dialog, ErrorState, Kpi, Notice, Skeleton } from '../components/ui/blocks';
import { useApi } from '../lib/hooks';
import { CLASSIFICATION, fmtDate, fmtDateTime, toInputDate } from '../lib/format';
import './screens.css';

const DAY = 86_400_000;

export function consentState(c: Consent | undefined, now = Date.now()): 'active' | 'expiring' | 'revoked' | 'expired' | 'none' {
  if (!c) return 'none';
  if (c.revoked_at) return 'revoked';
  const end = Date.parse(c.valid_until);
  if (end < now) return 'expired';
  return end - now <= 30 * DAY ? 'expiring' : 'active';
}

const STATE_UI = {
  active: { label: 'Активна', tone: 'success' },
  expiring: { label: 'Закінчується', tone: 'warning' },
  revoked: { label: 'Відкликана', tone: 'danger' },
  expired: { label: 'Строк минув', tone: 'neutral' },
  none: { label: 'Немає згоди', tone: 'neutral' },
} as const;

export function ConsentPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const datasets = useApi(listDatasets);
  const consents = useApi(() => listConsents(isAdmin), [isAdmin]);
  const [grantFor, setGrantFor] = useState<Dataset | null>(null);
  const [revokeFor, setRevokeFor] = useState<{ c: Consent; ds?: Dataset } | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const list = consents.data ?? [];
  const now = Date.now();
  const states = list.map((c) => consentState(c, now));
  const consentable = (datasets.data ?? []).filter((d) => d.requires_consent);
  const dsTitle = (code: string) => datasets.data?.find((d) => d.code === code)?.title ?? code;
  const latest = (code: string) => list.filter((c) => c.dataset_code === code && c.user_email === user?.email).sort((a, b) => b.granted_at.localeCompare(a.granted_at))[0];

  async function doGrant(ds: Dataset, until: string) {
    try {
      const c = await grantConsent(ds.code, until);
      setFlash({ tone: 'success', text: `Згоду ${c.id} надано до ${fmtDate(c.valid_until)}. Запити до набору «${ds.title}» тепер проходитимуть крок 4.` });
      setGrantFor(null);
      await consents.reload();
    } catch (e) {
      setFlash({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Не вдалося надати згоду.' });
    }
  }
  async function doRevoke(c: Consent) {
    try {
      await revokeConsent(c.id);
      setFlash({ tone: 'success', text: `Згоду ${c.id} відкликано. Наступні запити до набору «${dsTitle(c.dataset_code)}» буде відхилено з кодом 403.` });
      setRevokeFor(null);
      await consents.reload();
    } catch (e) {
      setFlash({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Не вдалося відкликати згоду.' });
    }
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Згоди користувачів' : 'Мої згоди'}
        subtitle={isAdmin ? 'UC-03, UC-04 · усі згоди на обробку наборів, що їх вимагають' : 'UC-03, UC-04 · ви вирішуєте, чи можна обробляти вашу геолокацію й персональні дані'}
        actions={<Badge tone="primary">EZW-51</Badge>}
      />
      <div className="kpi-row kpi-row--3">
        <Kpi icon={<ShieldCheck size={20} />} tone="success" label="Активні згоди" value={states.filter((s) => s === 'active' || s === 'expiring').length} />
        <Kpi icon={<Clock size={20} />} tone="warning" label="Закінчуються ≤ 30 днів" value={states.filter((s) => s === 'expiring').length} />
        <Kpi icon={<Ban size={20} />} tone="danger" label="Відкликані" value={states.filter((s) => s === 'revoked').length} />
      </div>
      {flash && (
        <div className="cn-flash">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}
      {(consents.error || datasets.error) && <ErrorState message={consents.error ?? datasets.error ?? ''} onRetry={() => void Promise.all([consents.reload(), datasets.reload()])} />}

      {isAdmin ? (
        <Card title="Реєстр згод" subtitle="Згода чинна від granted_at до valid_until, поки її не відкликано" pad={false} id="registry">
          {consents.loading && !consents.data ? (
            <div style={{ padding: '0 20px' }}>
              <Skeleton />
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Користувач</th>
                    <th>Набір</th>
                    <th>Надано</th>
                    <th>Діє до</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => {
                    const st = STATE_UI[consentState(c, now)];
                    return (
                      <tr key={c.id}>
                        <td className="mono">{c.id}</td>
                        <td>{c.user_email}</td>
                        <td>{dsTitle(c.dataset_code)}</td>
                        <td>{fmtDate(c.granted_at)}</td>
                        <td>{fmtDate(c.valid_until)}</td>
                        <td>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td>{!c.revoked_at && <Button variant="ghost" onClick={() => setRevokeFor({ c })}>Відкликати</Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div className="cn-grid">
          <Card title="Набори, що потребують вашої згоди" subtitle="Без чинної згоди сервер відхиляє запит на кроці 4 з кодом 403" id="needs">
            {datasets.loading && !datasets.data ? (
              <Skeleton rows={2} />
            ) : (
              <div className="cn-list">
                {consentable.map((ds) => {
                  const c = latest(ds.code);
                  const s = consentState(c, now);
                  const on = s === 'active' || s === 'expiring';
                  const cl = ds.classification ? CLASSIFICATION[ds.classification] : null;
                  return (
                    <article key={ds.code} className="cn-item" aria-label={ds.title}>
                      <span className={`cn-item__icon${on ? ' cn-item__icon--on' : ''}`}>{ds.classification === 'restricted' ? <Lock size={20} aria-hidden /> : <MapPinned size={20} aria-hidden />}</span>
                      <div className="cn-item__body">
                        <span className="t-title-s">{ds.title}</span>
                        <span className="t-body-s muted">{ds.description}</span>
                        <span className="cn-item__meta">
                          <Badge tone={STATE_UI[s].tone}>{STATE_UI[s].label}</Badge>
                          {cl && <Badge tone={cl.tone}>{cl.label}</Badge>}
                          {c && on && (
                            <span className="t-body-s muted">
                              <CalendarClock size={13} aria-hidden /> до {fmtDate(c.valid_until)} · {c.id}
                            </span>
                          )}
                          {c && s === 'revoked' && <span className="t-body-s muted">відкликано {fmtDate(c.revoked_at!)}</span>}
                        </span>
                      </div>
                      <div className="cn-item__actions">
                        {on ? (
                          <Button variant="danger" icon={<ShieldOff size={18} aria-hidden />} onClick={() => setRevokeFor({ c: c!, ds })}>
                            Відкликати
                          </Button>
                        ) : (
                          <Button icon={<ShieldCheck size={18} aria-hidden />} onClick={() => setGrantFor(ds)}>
                            Надати згоду
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Card>
          <div className="cr-col">
            <Card title="Історія" subtitle="Зміни згод фіксуються в журналі аудиту" id="hist">
              {list.length === 0 ? (
                <p className="t-body-s muted">Згод ще не було.</p>
              ) : (
                <ul className="timeline">
                  {list.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <i className={c.revoked_at ? 'off' : 'on'} />
                      <div>
                        <p className="t-label-s">
                          {c.revoked_at ? 'Відкликано' : 'Надано'} · {dsTitle(c.dataset_code)}
                        </p>
                        <p className="t-body-s muted">
                          {fmtDateTime(c.revoked_at ?? c.granted_at)} · <span className="mono">{c.id}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Notice tone="info" icon={<Info size={16} aria-hidden />}>
              Відкликання діє одразу: уже видані дані не повертаються, але наступні запити буде відхилено. Персональні дані (клас «Обмежені») не видаються навіть за згоди без окремого права ролі.
            </Notice>
          </div>
        </div>
      )}

      {grantFor && <GrantDialog ds={grantFor} onClose={() => setGrantFor(null)} onConfirm={(until) => doGrant(grantFor, until)} />}
      {revokeFor && (
        <Dialog
          title="Відкликати згоду?"
          onClose={() => setRevokeFor(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRevokeFor(null)}>
                Скасувати
              </Button>
              <Button variant="danger" icon={<ShieldOff size={18} aria-hidden />} onClick={() => doRevoke(revokeFor.c)}>
                Відкликати
              </Button>
            </>
          }
        >
          <p>
            Згода <b className="mono">{revokeFor.c.id}</b> на набір «{dsTitle(revokeFor.c.dataset_code)}» перестане діяти зараз. Наступні запити до цього набору сервер відхилить з кодом 403 (немає згоди).
          </p>
        </Dialog>
      )}
    </>
  );
}

function GrantDialog({ ds, onClose, onConfirm }: { ds: Dataset; onClose: () => void; onConfirm: (until: string) => Promise<void> }) {
  const plus = (days: number) => toInputDate(new Date(Date.now() + days * DAY));
  const [until, setUntil] = useState(plus(30));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!agree) {
      setErr('Підтвердьте, що ознайомилися з умовами обробки.');
      return;
    }
    setBusy(true);
    await onConfirm(new Date(`${until}T23:59:59`).toISOString());
    setBusy(false);
  };
  return (
    <Dialog
      title="Надати згоду"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Скасувати
          </Button>
          <Button loading={busy} icon={<ShieldCheck size={18} aria-hidden />} onClick={submit}>
            Надати згоду
          </Button>
        </>
      }
    >
      <p>
        Набір «<b>{ds.title}</b>» ({ds.owner}). {ds.description}
      </p>
      <div className="form-row">
        <label htmlFor="until">Діє до</label>
        <input id="until" type="date" className="date" value={until} min={plus(1)} onChange={(e) => setUntil(e.target.value)} />
        <div className="presets">
          {[30, 90, 180].map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={until === plus(d)} onClick={() => setUntil(plus(d))}>
              {d} днів
            </button>
          ))}
        </div>
      </div>
      <Checkbox label="Я розумію, хто й з якою метою оброблятиме ці дані, і можу відкликати згоду будь-коли" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(null); }} />
      {err && (
        <p className="field__hint err" role="alert">
          {err}
        </p>
      )}
    </Dialog>
  );
}
