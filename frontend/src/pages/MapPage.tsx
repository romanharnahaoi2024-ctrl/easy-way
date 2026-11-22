import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Accessibility, BusFront, Clock, Crosshair, MapPin, RefreshCw, Search, TramFront, Bus, X } from 'lucide-react';
import { getRoutes, getVehiclePositions, routeMode } from '../api/data';
import type { Route, TransitMode, VehiclePosition } from '../api/types';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button } from '../components/ui';
import { ErrorState, Skeleton } from '../components/ui/blocks';
import { useApi, useNow, usePolling } from '../lib/hooks';
import { ago, fmtTime } from '../lib/format';
import './map.css';

/** NFR-02: опитування кожні 10 с, позиція старша за 30 с — застаріла */
export const POLL_MS = 10_000;
export const STALE_MS = 30_000;
const LVIV: [number, number] = [49.8395, 24.022];

const MODE: Record<TransitMode, { label: string; color: string; icon: typeof Bus }> = {
  tram: { label: 'Трамвай', color: '#E5484D', icon: TramFront },
  trolleybus: { label: 'Тролейбус', color: '#0F9F8F', icon: BusFront },
  bus: { label: 'Автобус', color: '#7C5CFC', icon: Bus },
};

export const isStale = (p: VehiclePosition, now: number) => now - Date.parse(p.observed_at) > STALE_MS;

function nearestStop(route: Route | undefined, p: VehiclePosition) {
  if (!route) return null;
  let best = route.stops[0];
  let bd = Infinity;
  for (const s of route.stops) {
    const d = Math.hypot(s.lat - p.lat, s.lon - p.lon);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

export function MapPage() {
  const routes = useApi(getRoutes);
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<TransitMode, boolean>>({ tram: true, trolleybus: true, bus: true });
  const [lowFloor, setLowFloor] = useState(false);
  const [query, setQuery] = useState('');
  const [selRoute, setSelRoute] = useState<string | null>(null);
  const [selVehicle, setSelVehicle] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const now = useNow(1000);

  const loadPositions = async () => {
    try {
      setPositions(await getVehiclePositions());
      setFetchedAt(Date.now());
      setPosError(null);
    } catch {
      // NFR «Доступність»: при відмові джерела лишаємо останні відомі дані з позначкою часу
      setPosError('Не вдалося оновити позиції. Показано останні відомі дані.');
    }
  };
  useEffect(() => {
    void loadPositions();
  }, []);
  usePolling(loadPositions, POLL_MS);

  const routeByCode = useMemo(() => new Map((routes.data ?? []).map((r) => [r.code, r])), [routes.data]);
  const q = query.trim().toLowerCase();
  const visibleRoutes = (routes.data ?? []).filter(
    (r) => modes[routeMode(r)] && (!q || r.code.toLowerCase().includes(q) || r.direction.toLowerCase().includes(q) || r.stops.some((s) => s.name.toLowerCase().includes(q))),
  );
  const visibleCodes = new Set(visibleRoutes.map((r) => r.code));
  const visibleVehicles = positions.filter((p) => (!p.route_code || visibleCodes.has(p.route_code)) && (!lowFloor || p.low_floor));
  const staleCount = positions.filter((p) => isStale(p, now)).length;
  const vehicle = positions.find((p) => p.fleet_code === selVehicle);
  const toggleMode = (m: TransitMode) => setModes((s) => ({ ...s, [m]: !s[m] }));

  function routeStatus(r: Route): { label: string; tone: 'success' | 'warning' | 'danger' } {
    const vs = positions.filter((p) => p.route_code === r.code);
    if (vs.some((p) => isStale(p, now))) return { label: 'Збій GPS', tone: 'danger' };
    if (vs.length === 0) return { label: 'Немає на лінії', tone: 'warning' };
    return { label: `${vs.length} на лінії`, tone: 'success' };
  }

  return (
    <>
      <PageHeader
        title="Мапа транспорту"
        subtitle={`Реальний час · ${positions.length} одиниць на лінії · оновлення кожні ${POLL_MS / 1000} с`}
        actions={
          <>
            <Badge tone="lime" live>
              LIVE
            </Badge>
            <Button variant="secondary" icon={<RefreshCw size={18} aria-hidden />} onClick={() => void loadPositions()}>
              Оновити
            </Button>
          </>
        }
      />
      <div className="map-layout">
        <aside className="card map-panel" aria-label="Маршрути">
          <label className="map-search">
            <Search size={18} aria-hidden />
            <span className="sr-only">Пошук маршруту або зупинки</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Маршрут або зупинка" />
          </label>
          <div className="map-chips" role="group" aria-label="Вид транспорту">
            {(Object.keys(MODE) as TransitMode[]).map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={modes[m]} onClick={() => toggleMode(m)}>
                <i style={{ background: MODE[m].color }} />
                {MODE[m].label}
                <span className="muted">{(routes.data ?? []).filter((r) => routeMode(r) === m).length}</span>
              </button>
            ))}
          </div>
          <div className="map-lowfloor">
            <Accessibility size={18} aria-hidden />
            <span id="lf-label">Лише низькопідлоговий</span>
            <button type="button" role="switch" className="toggle" aria-checked={lowFloor} aria-labelledby="lf-label" onClick={() => setLowFloor((v) => !v)} />
          </div>
          <p className="t-overline muted map-list-head">
            Маршрути <span>{visibleRoutes.length}</span>
          </p>
          {routes.error && <ErrorState message={routes.error} onRetry={routes.reload} />}
          {routes.loading && !routes.data ? (
            <Skeleton rows={5} />
          ) : (
            <ul className="route-list">
              {visibleRoutes.map((r) => {
                const m = routeMode(r);
                const st = routeStatus(r);
                const sel = selRoute === r.code;
                return (
                  <li key={r.code}>
                    <button type="button" className={`route-row${sel ? ' route-row--sel' : ''}`} aria-pressed={sel} onClick={() => setSelRoute(sel ? null : r.code)}>
                      <span className="route-badge" style={{ background: MODE[m].color }}>
                        {r.code}
                      </span>
                      <span className="route-row__text">
                        <span className="t-title-s">{r.direction}</span>
                        <span className="t-body-s muted">
                          {MODE[m].label} · {r.stops.length} зупинок
                        </span>
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </button>
                  </li>
                );
              })}
              {visibleRoutes.length === 0 && <li className="t-body-s muted">Нічого не знайдено. Змініть пошук або фільтри.</li>}
            </ul>
          )}
        </aside>

        <section className={`card map-area${offline ? ' map-area--offline' : ''}`} aria-label="Мапа">
          <MapContainer center={LVIV} zoom={13} zoomControl={false} className="leaflet-host" attributionControl>
            {!offline && (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                eventHandlers={{ tileerror: () => setOffline(true) }}
              />
            )}
            {offline && <SchematicBase routes={routes.data ?? []} />}
            <ZoomTools />
            <FitRoute route={selRoute ? routeByCode.get(selRoute) : undefined} />
            {visibleRoutes.map((r) => {
              const color = MODE[routeMode(r)].color;
              const dim = selRoute && selRoute !== r.code;
              const pts = r.stops.map((s) => [s.lat, s.lon] as [number, number]);
              return (
                <Polyline key={r.code} positions={pts} pathOptions={{ color, weight: selRoute === r.code ? 7 : 5, opacity: dim ? 0.25 : 0.9, lineCap: 'round', lineJoin: 'round' }} eventHandlers={{ click: () => setSelRoute(r.code) }} />
              );
            })}
            {visibleRoutes.flatMap((r) =>
              r.stops.map((s) => (
                <CircleMarker key={`${r.code}-${s.id}`} center={[s.lat, s.lon]} radius={5} pathOptions={{ color: MODE[routeMode(r)].color, weight: 2.5, fillColor: '#fff', fillOpacity: 1, opacity: selRoute && selRoute !== r.code ? 0.3 : 1 }}>
                  <Tooltip direction="top" offset={[0, -4]}>
                    {s.name} · {r.code}
                  </Tooltip>
                </CircleMarker>
              )),
            )}
            {visibleVehicles.map((p) => (
              <VehicleMarker key={p.fleet_code} p={p} route={p.route_code ? routeByCode.get(p.route_code) : undefined} stale={isStale(p, now)} selected={selVehicle === p.fleet_code} onSelect={() => setSelVehicle(p.fleet_code)} />
            ))}
          </MapContainer>

          <div className="map-live" role="status" aria-live="polite">
            <span className="map-live__dot" />
            {fetchedAt ? `Оновлено ${ago(new Date(fetchedAt).toISOString(), now)} · GPS` : 'Завантаження позицій…'}
          </div>
          {(posError || staleCount > 0 || offline) && (
            <div className="map-alerts">
              {posError && <span className="map-alert map-alert--danger">{posError}</span>}
              {staleCount > 0 && <span className="map-alert">{staleCount} позиція застаріла (понад 30 с)</span>}
              {offline && <span className="map-alert map-alert--muted">Тайли мапи недоступні, показано схему</span>}
            </div>
          )}
          <div className="map-legend card">
            {(Object.keys(MODE) as TransitMode[]).map((m) => (
              <span key={m}>
                <i style={{ background: MODE[m].color }} />
                {MODE[m].label}
              </span>
            ))}
            <span>
              <i className="legend-stale" />
              Застаріла позиція
            </span>
          </div>
          {vehicle && <VehicleCard p={vehicle} route={vehicle.route_code ? routeByCode.get(vehicle.route_code) : undefined} now={now} onClose={() => setSelVehicle(null)} onShowRoute={(c) => setSelRoute(c)} />}
        </section>
      </div>
    </>
  );
}

function VehicleMarker({ p, route, stale, selected, onSelect }: { p: VehiclePosition; route?: Route; stale: boolean; selected: boolean; onSelect: () => void }) {
  const m = route ? routeMode(route) : 'bus';
  const html = `<span class="veh${stale ? ' veh--stale' : ''}${selected ? ' veh--sel' : ''}"><b style="background:${stale ? '#8A94A6' : MODE[m].color}">${route?.code ?? '—'}</b>${p.fleet_code}</span>`;
  const icon = useMemo(() => L.divIcon({ html, className: 'veh-wrap', iconSize: undefined, iconAnchor: [16, 14] }), [html]);
  return (
    <Marker position={[p.lat, p.lon]} icon={icon} eventHandlers={{ click: onSelect }} keyboard title={`${route?.name ?? 'Транспорт'} · борт ${p.fleet_code}${stale ? ' · застаріла позиція' : ''}`} zIndexOffset={selected ? 1000 : 0} />
  );
}

function VehicleCard({ p, route, now, onClose, onShowRoute }: { p: VehiclePosition; route?: Route; now: number; onClose: () => void; onShowRoute: (code: string) => void }) {
  const m = route ? routeMode(route) : 'bus';
  const Icon = MODE[m].icon;
  const stale = isStale(p, now);
  const stop = nearestStop(route, p);
  return (
    <aside className="card veh-card" aria-label="Деталі транспорту">
      <header className="veh-card__head">
        <span className="veh-card__icon" style={{ background: MODE[m].color }}>
          <Icon size={20} aria-hidden />
        </span>
        <div>
          <p className="t-title-s">
            {route?.name ?? 'Транспорт'} · борт {p.fleet_code}
          </p>
          <p className="t-body-s muted">{route?.direction}</p>
        </div>
        <button type="button" className="blk-x" onClick={onClose} aria-label="Закрити деталі">
          <X size={18} />
        </button>
      </header>
      <div className="veh-card__badges">
        {stale ? <Badge tone="danger">Застаріла позиція</Badge> : <Badge tone="success">GPS актуальний</Badge>}
        {p.low_floor && <Badge tone="info">Низькопідлоговий</Badge>}
        <Badge tone="success">Публічні</Badge>
      </div>
      <dl className="kv">
        <dt>
          <MapPin size={14} aria-hidden /> Біля зупинки
        </dt>
        <dd>{stop?.name ?? '—'}</dd>
        <dt>
          <Clock size={14} aria-hidden /> Спостереження
        </dt>
        <dd>
          {fmtTime(p.observed_at)} · {ago(p.observed_at, now)}
        </dd>
        <dt>
          <Crosshair size={14} aria-hidden /> Координати
        </dt>
        <dd className="mono">
          {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
        </dd>
      </dl>
      {route && (
        <Button variant="secondary" block onClick={() => onShowRoute(route.code)}>
          Показати маршрут {route.code}
        </Button>
      )}
    </aside>
  );
}

function FitRoute({ route }: { route?: Route }) {
  const map = useMap();
  useEffect(() => {
    if (route) map.fitBounds(L.latLngBounds(route.stops.map((s) => [s.lat, s.lon])), { padding: [60, 60], maxZoom: 15 });
  }, [route, map]);
  return null;
}

function ZoomTools() {
  const map = useMap();
  return (
    <div className="map-zoom card">
      <button type="button" onClick={() => map.zoomIn()} aria-label="Наблизити">
        +
      </button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Віддалити">
        −
      </button>
      <button type="button" onClick={() => map.setView(LVIV, 13)} aria-label="Центр міста">
        <Crosshair size={16} />
      </button>
    </div>
  );
}

/** Резервна підкладка, коли тайли недоступні: схема вулиць і парків центру Львова */
function SchematicBase({ routes }: { routes: Route[] }) {
  const lines: [number, number][][] = [];
  for (let lat = 49.79; lat <= 49.885; lat += 0.0045) lines.push([[lat, 23.92], [lat, 24.11]]);
  for (let lon = 23.92; lon <= 24.11; lon += 0.0068) lines.push([[49.79, lon], [49.885, lon]]);
  const parks: [number, number, number][] = [[49.8245, 24.0215, 600], [49.8485, 24.0392, 420], [49.8545, 24.0705, 650], [49.8275, 24.0625, 450], [49.8425, 23.9665, 380]];
  return (
    <Pane name="schematic" style={{ zIndex: 200 }}>
      {lines.map((l, i) => (
        <Polyline key={i} positions={l} pathOptions={{ color: '#ffffff', weight: 3, opacity: 0.9, interactive: false }} />
      ))}
      {parks.map(([lat, lon, r], i) => (
        <CircleMarker key={`p${i}`} center={[lat, lon]} radius={r / 18} pathOptions={{ stroke: false, fillColor: '#CFE8D3', fillOpacity: 1, interactive: false }} />
      ))}
      {routes.map((r) => (
        <Polyline key={`u${r.code}`} positions={r.stops.map((s) => [s.lat, s.lon] as [number, number])} pathOptions={{ color: '#ffffff', weight: 13, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }} />
      ))}
    </Pane>
  );
}
