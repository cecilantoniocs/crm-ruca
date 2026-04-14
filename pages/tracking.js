// /pages/tracking.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '@/components/Layout';
import DateInput from '@/components/DateInput';
import axiosClient from '@/config/axios';
import { getCurrentUser, can, isAdmin as isAdminHelper } from '@/helpers/permissions';
import { RefreshCw, ChevronRight, MapPin } from 'lucide-react';

// React-Leaflet solo en cliente
const MapContainer  = dynamic(() => import('react-leaflet').then(m => m.MapContainer),  { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });
const Polyline      = dynamic(() => import('react-leaflet').then(m => m.Polyline),      { ssr: false });
const CircleMarker  = dynamic(() => import('react-leaflet').then(m => m.CircleMarker),  { ssr: false });

let L = null;
if (typeof window !== 'undefined') {
  L = require('leaflet'); // eslint-disable-line global-require
}

// ── Utilidades ────────────────────────────────────────────────────────────────

// Asegura que el string sea parseado como UTC (Supabase devuelve sin 'Z')
const toUTC = (iso) => {
  if (!iso) return null;
  const s = String(iso);
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s.replace(' ', 'T') + 'Z';
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(toUTC(iso));
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const fmtDist = (km) => {
  if (km == null || isNaN(km)) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
};

const fmtDuration = (secs) => {
  if (!secs || secs < 60) return '< 1 min';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
};

const timeAgo = (ts, now) => {
  if (!ts) return '—';
  // ts puede ser un Date object (ej: lastRefreshTime) o un string ISO
  const d = ts instanceof Date ? ts : new Date(toUTC(ts));
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return `Hace ${h}h`;
};

// Distancia en metros entre dos coordenadas (Haversine)
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Bearing en grados entre dos puntos (0° = Norte)
const bearingDeg = (lat1, lng1, lat2, lng2) => {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
          - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// ── Map matching (OSRM) ───────────────────────────────────────────────────────
// Ajusta una secuencia de puntos GPS a las calles reales via OSRM public API.
// Devuelve array de [lat, lng] para Leaflet, o los puntos crudos si falla.
const OSRM_MATCH = 'https://router.project-osrm.org/match/v1/driving';
const OSRM_CHUNK = 80; // max coords por request (seguro bajo el límite de URL)

async function snapChunkToRoads(chunk) {
  const coords     = chunk.map(p => `${p.lng},${p.lat}`).join(';');
  // Timestamps Unix en segundos — ayuda a OSRM a estimar velocidades y elegir la ruta correcta
  const timestamps = chunk.map(p => Math.floor(new Date(toUTC(p.createdAt)).getTime() / 1000)).join(';');
  // radiuses=50 permite que OSRM busque la calle más cercana hasta 50 m del punto GPS
  const radiuses   = chunk.map(() => 50).join(';');
  const url = `${OSRM_MATCH}/${coords}?overview=full&geometries=geojson&gaps=ignore&tidy=true&timestamps=${timestamps}&radiuses=${radiuses}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const m of data.matchings || []) {
    for (const [lng, lat] of m.geometry.coordinates) out.push([lat, lng]);
  }
  return out.length ? out : chunk.map(p => [p.lat, p.lng]);
}

async function snapToRoads(arr) {
  if (arr.length < 2) return arr.map(p => [p.lat, p.lng]);
  const result = [];
  for (let i = 0; i < arr.length; i += OSRM_CHUNK) {
    const chunk = arr.slice(i, Math.min(i + OSRM_CHUNK, arr.length));
    // Solapamos el último punto del chunk anterior para continuidad
    const withOverlap = i > 0 ? [arr[i - 1], ...chunk] : chunk;
    try {
      const snapped = await snapChunkToRoads(withOverlap);
      // Descartamos el primer punto del overlap (ya fue incluido por el chunk anterior)
      result.push(...(i > 0 ? snapped.slice(1) : snapped));
    } catch {
      result.push(...chunk.map(p => [p.lat, p.lng]));
    }
  }
  return result;
}

// ── Paleta y estilos ──────────────────────────────────────────────────────────

const PALETTE    = ['2563eb', 'dc2626', '16a34a', 'f97316', '7c3aed'];
const TRUCK_ICONS = ['/icons/truck1.svg','/icons/truck2.svg','/icons/truck3.svg','/icons/truck4.svg','/icons/truck5.svg'];

const STATUS_CLS   = { online: 'bg-emerald-500', idle: 'bg-amber-400', offline: 'bg-gray-400', historical: 'bg-blue-400' };
const STATUS_LABEL = { online: 'En línea', idle: 'Inactivo', offline: 'Sin señal', historical: 'Historial' };

// Ícono de camión (con soporte de parpadeo y gris)
const makeTruckIcon = (url, { blink = false, gray = false } = {}) => {
  if (!L) return undefined;
  return L.icon({
    iconUrl: url,
    iconSize: [36, 36],
    iconAnchor: [18, 30],
    popupAnchor: [0, -26],
    className: [blink ? 'truck-blink' : '', gray ? 'truck-gray' : ''].filter(Boolean).join(' '),
  });
};

// Ícono de flecha de dirección (triángulo rotado)
const makeArrowIcon = (bearing, color) => {
  if (!L) return undefined;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:0;height:0;
      border-left:5px solid transparent;
      border-right:5px solid transparent;
      border-bottom:11px solid #${color};
      transform:rotate(${bearing}deg);
      opacity:0.75;
    "></div>`,
    iconSize: [10, 11],
    iconAnchor: [5, 5],
  });
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function TrackingPage() {
  const me      = useMemo(() => { try { return getCurrentUser(); } catch { return null; } }, []);
  const canView = isAdminHelper(me) || can('tracking.view', null, me);

  // ── State ─────────────────────────────────────────────────────────────────
  const [couriers,        setCouriers]        = useState([]);
  const [courierId,       setCourierId]       = useState('all');
  const [date,            setDate]            = useState(todayYMD);
  const [from,            setFrom]            = useState('00:00');
  const [to,              setTo]              = useState('23:59');
  const [points,          setPoints]          = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [map,             setMap]             = useState(null);
  const [basemap,         setBasemap]         = useState('streets');
  const [autoRefresh,     setAutoRefresh]     = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [panelOpen,       setPanelOpen]       = useState(false);
  const [now,             setNow]             = useState(() => new Date());
  const [matchedLines,    setMatchedLines]    = useState(new Map()); // courierId → [[lat,lng]]
  const [matchingRoutes,  setMatchingRoutes]  = useState(false);

  const isToday = date === todayYMD();

  // ── Meta de couriers ──────────────────────────────────────────────────────
  const courierMeta = useMemo(() => {
    const m = new Map();
    for (const c of couriers) m.set(c.id, { name: c.name || null, email: c.email || null });
    return m;
  }, [couriers]);

  const colorIndexByCourier = useMemo(() => {
    const m = new Map();
    couriers.forEach((c, i) => m.set(c.id, i % PALETTE.length));
    return m;
  }, [couriers]);

  const iconByCourier = useCallback((cid, opts = {}) => {
    const idx = colorIndexByCourier.get(cid) ?? 0;
    return makeTruckIcon(TRUCK_ICONS[idx % TRUCK_ICONS.length], opts);
  }, [colorIndexByCourier]);

  // ── Cargar couriers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!canView) return;
    axiosClient.get('gps/couriers').then(r => setCouriers(r.data || [])).catch(() => {});
  }, [canView]);

  // ── Fetch de puntos ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = { date, from, to };
      if (courierId !== 'all') params.courierId = courierId;
      const { data } = await axiosClient.get('gps/track', { params });
      const withNames = (Array.isArray(data) ? data : []).map(p => {
        const cid  = p.courier_id || p.courierId;
        const meta = courierMeta.get(cid) || {};
        return {
          ...p,
          courierId:   cid,
          courierName: p.courier_name || p.courierName || meta.name || meta.email || 'Repartidor',
          createdAt:   p.createdAt || p.created_at,
        };
      });
      setPoints(withNames);
      setLastRefreshTime(new Date());
    } catch (e) {
      console.error(e);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [canView, date, from, to, courierId, courierMeta]); // eslint-disable-line

  // Fetch inicial + al cambiar filtros
  useEffect(() => { if (canView) fetchData(); }, [canView, courierId, date, from, to]); // eslint-disable-line

  // Auto-refresh cada 60s (solo cuando la fecha es hoy)
  useEffect(() => {
    if (!autoRefresh || !isToday || !canView) return;
    const id = setInterval(() => { fetchData(); setNow(new Date()); }, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, isToday, canView, fetchData]);

  // Actualizar "now" cada 30s para los indicadores de estado
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Map matching: ajustar rutas a calles via OSRM ─────────────────────────
  useEffect(() => {
    if (!points.length) { setMatchedLines(new Map()); return; }
    let cancelled = false;
    setMatchingRoutes(true);
    (async () => {
      const result = new Map();
      for (const [cid, arr] of groups.entries()) {
        if (cancelled) break;
        result.set(cid, await snapToRoads(arr));
      }
      if (!cancelled) { setMatchedLines(result); setMatchingRoutes(false); }
    })();
    return () => { cancelled = true; };
  }, [points]); // eslint-disable-line

  // ── Grupos de puntos por courier ──────────────────────────────────────────
  const groups = useMemo(() => {
    const g = new Map();
    for (const p of points) {
      if (!g.has(p.courierId)) g.set(p.courierId, []);
      g.get(p.courierId).push(p);
    }
    return g;
  }, [points]);

  // ── Metadatos por punto (velocidad, bearing) ──────────────────────────────
  const pointMeta = useMemo(() => {
    const meta = new Map();
    for (const [, arr] of groups.entries()) {
      for (let i = 0; i < arr.length; i++) {
        const p   = arr[i];
        const key = p.id ?? `${p.courierId}|${p.lat}|${p.lng}|${p.createdAt}`;
        if (i === 0) { meta.set(key, { speed: null, bearing: null }); continue; }
        const prev    = arr[i - 1];
        const distM   = distanceMeters(prev.lat, prev.lng, p.lat, p.lng);
        const tSecs   = (new Date(toUTC(p.createdAt)) - new Date(toUTC(prev.createdAt))) / 1000;
        const speedKmh = tSecs > 5 && distM >= 20 ? (distM / tSecs) * 3.6 : 0;
        const bearing  = bearingDeg(prev.lat, prev.lng, p.lat, p.lng);
        meta.set(key, { speed: speedKmh, bearing, distM, tSecs });
      }
    }
    return meta;
  }, [groups]);

  // ── Stats por courier (distancia, detenido, estado) ───────────────────────
  const courierStats = useMemo(() => {
    const stats = new Map();
    for (const [cid, arr] of groups.entries()) {
      let totalDistM = 0, movingDistM = 0, stoppedSecs = 0, movingSecs = 0;
      for (let i = 1; i < arr.length; i++) {
        const prev    = arr[i - 1], curr = arr[i];
        const distM   = distanceMeters(prev.lat, prev.lng, curr.lat, curr.lng);
        const tSecs   = (new Date(toUTC(curr.createdAt)) - new Date(toUTC(prev.createdAt))) / 1000;
        if (tSecs <= 0) continue;
        // Filtro de ruido GPS: ignorar segmentos < 20 m (imprecisión del sensor)
        if (distM < 20) { stoppedSecs += tSecs; continue; }
        totalDistM += distM; // distancia total real (para mostrar en panel)
        const speedKmh = (distM / tSecs) * 3.6;
        if (speedKmh < 30) {
          stoppedSecs += tSecs;
        } else {
          movingSecs  += tSecs;
          movingDistM += distM; // solo distancia a velocidad vehicular real
        }
      }
      const lastPoint  = arr[arr.length - 1] || null;
      const lastTs     = lastPoint ? new Date(toUTC(lastPoint.createdAt)) : null;
      const minsSince  = lastTs ? (now - lastTs) / 60_000 : Infinity;
      const status     = !isToday         ? 'historical'
                       : minsSince < 10   ? 'online'
                       : minsSince < 30   ? 'idle'
                       :                    'offline';
      const meta      = courierMeta.get(cid) || {};
      const totalDistKm = totalDistM / 1000;
      const firstPoint  = arr[0] || null;
      // avgSpeed = distancia / tiempo en movimiento (excluye paradas y ruido GPS)
      const avgSpeedKmh = movingSecs > 0 ? (movingDistM / 1000) / (movingSecs / 3600) : 0;

      // velocidad máxima del recorrido (solo segmentos con movimiento real ≥ 20 m)
      let maxSpeedKmh = 0;
      for (let i = 1; i < arr.length; i++) {
        const prev  = arr[i - 1], curr = arr[i];
        const d     = distanceMeters(prev.lat, prev.lng, curr.lat, curr.lng);
        const t     = (new Date(toUTC(curr.createdAt)) - new Date(toUTC(prev.createdAt))) / 1000;
        if (t > 5 && d >= 20) maxSpeedKmh = Math.max(maxSpeedKmh, (d / t) * 3.6);
      }

      stats.set(cid, {
        name: lastPoint?.courierName || meta.name || meta.email || 'Repartidor',
        totalDistKm, avgSpeedKmh, maxSpeedKmh,
        stoppedSecs, movingSecs,
        lastPoint, firstPoint, lastTs, minsSince, status,
        pointCount: arr.length,
      });
    }
    return stats;
  }, [groups, now, isToday, courierMeta]);

  // ── Set de keys del último punto de cada courier (ícono de camión) ────────
  const lastPointKeys = useMemo(() => {
    const keys = new Set();
    for (const [, arr] of groups.entries()) {
      if (arr.length) {
        const p = arr[arr.length - 1];
        keys.add(p.id ?? `${p.courierId}|${p.lat}|${p.lng}|${p.createdAt}`);
      }
    }
    return keys;
  }, [groups]);

  // ── Flechas de dirección a lo largo de cada ruta ──────────────────────────
  const arrowMarkers = useMemo(() => {
    const arrows = [];
    for (const [cid, arr] of groups.entries()) {
      if (arr.length < 3) continue;
      const color = PALETTE[colorIndexByCourier.get(cid) ?? 0];
      // máx ~10 flechas por ruta, distribuidas uniformemente
      const step = Math.max(1, Math.floor(arr.length / 10));
      for (let i = step; i < arr.length - 1; i += step) {
        const prev    = arr[i - 1], curr = arr[i];
        const bearing = bearingDeg(prev.lat, prev.lng, curr.lat, curr.lng);
        arrows.push({
          key:     `arrow-${cid}-${i}`,
          lat:     (prev.lat + curr.lat) / 2,
          lng:     (prev.lng + curr.lng) / 2,
          bearing, color,
        });
      }
    }
    return arrows;
  }, [groups, colorIndexByCourier]);

  // ── Reajustar Leaflet (inmediato, sin delay) ──────────────────────────────
  // Se llama cada vez que algo puede cambiar el tamaño del contenedor del mapa.
  const panelVisible = courierStats.size > 0;
  useEffect(() => {
    if (!map) return;
    try { map.invalidateSize(); } catch {}
  }, [map, panelOpen, panelVisible, loading, matchingRoutes]);

  // ── Encuadre del mapa (tras invalidar tamaño) ─────────────────────────────
  useEffect(() => {
    if (!map) return;
    // Primero invalidar tamaño, luego encuadrar con pequeño delay para que el DOM se estabilice
    try { map.invalidateSize(); } catch {}
    const t = setTimeout(() => {
      try { map.invalidateSize(); } catch {}
      if (!points?.length) { map.setView([-29.90453, -71.24894], 11); return; }
      if (points.length === 1) { map.setView([points[0].lat, points[0].lng], 14); return; }
      const lats = points.map(p => p.lat);
      const lngs = points.map(p => p.lng);
      try {
        map.fitBounds(
          [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
          { padding: [30, 30], maxZoom: 16 }
        );
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [map, points]);

  // ── ResizeObserver: detecta cambios reales de tamaño (robusto en iOS Safari) ──
  useEffect(() => {
    if (!map || typeof ResizeObserver === 'undefined') return;
    const container = map.getContainer();
    if (!container) return;
    const ro = new ResizeObserver(() => {
      try { map.invalidateSize(); } catch {}
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);

  // ── Centrar mapa en un courier ────────────────────────────────────────────
  const focusCourier = (cid) => {
    const stat = courierStats.get(cid);
    if (!stat?.lastPoint || !map) return;
    map.setView([stat.lastPoint.lat, stat.lastPoint.lng], 15);
  };

  // ── Sin permiso ───────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <Layout>
        <div className="p-6">
          <h1 className="text-xl font-semibold text-gray-800">Tracking</h1>
          <p className="text-gray-600 mt-2">No tienes acceso a este módulo.</p>
        </div>
      </Layout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-coffee tracking-tight">
            Tracking de <span className="text-brand-600">Repartidores</span>
          </h1>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">

            <div>
              <label className="block text-sm text-gray-600 mb-1">Repartidor</label>
              <select
                value={courierId}
                onChange={(e) => setCourierId(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white min-w-[220px]"
              >
                <option value="all">Todos</option>
                {couriers.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.email}</option>
                ))}
              </select>
            </div>

            {/* Fecha + horas: en móvil columna (horas juntas abajo), en desktop fila */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                <DateInput
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white min-w-[138px]"
                />
              </div>
              <div className="flex gap-2">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Desde</label>
                  <input type="time" value={from} onChange={(e) => setFrom(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Hasta</label>
                  <input type="time" value={to} onChange={(e) => setTo(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white" />
                </div>
              </div>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-black disabled:opacity-60"
            >
              {loading ? 'Cargando…' : 'Buscar'}
            </button>

            {/* Auto-refresh — solo cuando la fecha es hoy */}
            {isToday && (
              <div className="ml-auto flex items-center gap-2 self-end">
                <button
                  onClick={() => setAutoRefresh(v => !v)}
                  title={autoRefresh ? 'Auto-actualización activa (cada 60s). Click para pausar.' : 'Auto-actualización pausada. Click para activar.'}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${
                    autoRefresh
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-gray-300 text-gray-500'
                  }`}
                >
                  <RefreshCw size={14} className={autoRefresh ? 'animate-spin-slow' : ''} />
                  {autoRefresh ? 'En vivo' : 'Pausado'}
                </button>
                {lastRefreshTime && (
                  <span className="text-xs text-gray-400">{timeAgo(lastRefreshTime, now)}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mapa + Panel lateral derecho */}
        <div className="flex gap-4 items-start">

          {/* Mapa */}
          <div className="relative flex-1 rounded-xl overflow-hidden border border-gray-200 min-w-0"
            style={{ height: '70vh' }}>

            {/* Indicador road-matching */}
            {matchingRoutes && (
              <div className="absolute left-3 bottom-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/95 backdrop-blur border border-gray-200 text-xs text-gray-500 shadow">
                <RefreshCw size={11} className="animate-spin-slow shrink-0" />
                Ajustando ruta a calles…
              </div>
            )}

            {/* Botón capas */}
            <div className="absolute right-3 top-3 z-10">
              <button
                onClick={() => setBasemap(b => b === 'sat' ? 'streets' : 'sat')}
                className="px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur border border-gray-300 text-sm shadow hover:bg-white"
              >
                {basemap === 'sat' ? 'Ver calles' : 'Ver satelital'}
              </button>
            </div>

            <MapContainer
              style={{ height: '100%', width: '100%' }}
              center={[-29.90453, -71.24894]}
              zoom={11}
              scrollWheelZoom
              whenCreated={setMap}
            >
              {basemap === 'sat' ? (
                <TileLayer
                  attribution="&copy; Esri & OpenStreetMap"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              ) : (
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url={process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
                />
              )}

              {/* Polilíneas por courier (road-matched si está disponible, crudo como fallback) */}
              {[...groups.entries()].map(([cid, arr]) => {
                if (arr.length < 2) return null;
                const positions = matchedLines.get(cid) || arr.map(p => [p.lat, p.lng]);
                const color = `#${PALETTE[colorIndexByCourier.get(cid) ?? 0]}`;
                return (
                  <Polyline
                    key={`line-${cid}`}
                    positions={positions}
                    pathOptions={{ color, weight: 3, opacity: 0.75 }}
                  />
                );
              })}

              {/* Flechas de dirección */}
              {arrowMarkers.map(a => (
                <Marker
                  key={a.key}
                  position={[a.lat, a.lng]}
                  icon={makeArrowIcon(a.bearing, a.color)}
                />
              ))}

              {/* Puntos intermedios (círculos pequeños) */}
              {points.map((p) => {
                const key = p.id ?? `${p.courierId}|${p.lat}|${p.lng}|${p.createdAt}`;
                if (lastPointKeys.has(key)) return null; // el último se dibuja como camión
                const colorIdx = colorIndexByCourier.get(p.courierId) ?? 0;
                const meta     = pointMeta.get(key);
                return (
                  <CircleMarker
                    key={key}
                    center={[p.lat, p.lng]}
                    radius={4}
                    pathOptions={{
                      color:       `#${PALETTE[colorIdx]}`,
                      fillColor:   `#${PALETTE[colorIdx]}`,
                      fillOpacity: 0.75,
                      weight:      1,
                    }}
                  >
                    <Popup>
                      <div className="text-sm space-y-0.5 min-w-[150px]">
                        <div className="font-semibold">{p.courierName}</div>
                        <div className="text-gray-500">{fmtTime(p.createdAt)}</div>
                        {meta?.speed != null && (
                          <div>{meta.speed < 1 ? '🅿 Detenido' : `🚗 ${meta.speed.toFixed(0)} km/h`}</div>
                        )}
                        {p.accuracy != null && (
                          <div className="text-gray-400 text-xs">Precisión: {Math.round(p.accuracy)} m</div>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {/* Último punto de cada courier (ícono de camión) */}
              {[...groups.entries()].map(([cid, arr]) => {
                if (!arr.length) return null;
                const p    = arr[arr.length - 1];
                const key  = p.id ?? `${p.courierId}|${p.lat}|${p.lng}|${p.createdAt}`;
                const stat = courierStats.get(cid);
                const meta = pointMeta.get(key);
                const blink = isToday && stat?.status === 'online';
                const gray  = isToday && stat?.status === 'offline';
                return (
                  <Marker
                    key={`last-${key}`}
                    position={[p.lat, p.lng]}
                    icon={iconByCourier(cid, { blink, gray })}
                  >
                    <Popup>
                      <div className="text-sm space-y-1 min-w-[190px]">
                        <div className="font-semibold text-base">{p.courierName}</div>

                        {/* Estado */}
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${STATUS_CLS[stat?.status || 'historical']}`} />
                          <span className="text-gray-600">{STATUS_LABEL[stat?.status || 'historical']}</span>
                          {stat?.lastTs && (
                            <span className="text-gray-400 text-xs">· {timeAgo(stat.lastTs, now)}</span>
                          )}
                        </div>

                        <hr className="border-gray-100" />

                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                          <span className="text-gray-500">Hora:</span>
                          <span>{fmtTime(p.createdAt)}</span>

                          {meta?.speed != null && <>
                            <span className="text-gray-500">Velocidad:</span>
                            <span>{meta.speed < 1 ? 'Detenido' : `${meta.speed.toFixed(0)} km/h`}</span>
                          </>}

                          <span className="text-gray-500">Distancia:</span>
                          <span>{fmtDist(stat?.totalDistKm)}</span>

                          <span className="text-gray-500">Detenido:</span>
                          <span>{fmtDuration(stat?.stoppedSecs)}</span>

                          {p.accuracy != null && <>
                            <span className="text-gray-500">Precisión:</span>
                            <span>{Math.round(p.accuracy)} m</span>
                          </>}
                        </div>

                        <div className="mt-1">
                          <a className="text-brand-700 underline text-xs" target="_blank" rel="noreferrer"
                            href={`https://maps.google.com/?q=${p.lat},${p.lng}`}>
                            Abrir en Google Maps
                          </a>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* Panel lateral DERECHO — wrapper siempre en DOM para evitar layout shifts */}
          <div className={`shrink-0 flex flex-col ${panelOpen ? 'w-64' : 'w-10'}`} style={panelOpen ? { height: '70vh' } : {}}>

            {/* Botón compacto cuando está cerrado */}
            {!panelOpen && (
              <button
                onClick={() => setPanelOpen(true)}
                title="Ver repartidores"
                className="h-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 bg-brand-600 border border-brand-600 rounded-xl shadow-sm text-white hover:bg-brand-700 transition-colors"
              >
                <ChevronRight size={16} />
                <span className="text-[10px] font-medium [writing-mode:vertical-rl] rotate-180 tracking-wide">
                  Repartidores
                </span>
              </button>
            )}

            {/* Panel expandido */}
            {panelOpen && (
            <div className="w-full h-full bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">

              {/* Cabecera con toggle */}
              <button
                onClick={() => setPanelOpen(false)}
                className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-t-xl shrink-0 w-full"
              >
                <span>Repartidores</span>
                <ChevronRight size={16} className="rotate-180" />
              </button>

              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {(() => {
                  const list = [...courierStats.entries()]
                    .filter(([cid]) => couriers.some(c => c.id === cid))
                    .sort(([, a], [, b]) => {
                      const ta = a.lastTs ? a.lastTs.getTime() : 0;
                      const tb = b.lastTs ? b.lastTs.getTime() : 0;
                      return tb - ta;
                    });
                  if (list.length === 0) {
                    return (
                      <div className="flex items-center justify-center h-full text-xs text-gray-400">
                        {loading ? 'Cargando…' : 'Sin datos para esta fecha'}
                      </div>
                    );
                  }
                  return list.map(([cid, stat]) => {
                    const color = `#${PALETTE[colorIndexByCourier.get(cid) ?? 0]}`;
                    return (
                      <div key={cid} className="p-3 space-y-2.5">

                        {/* Nombre + botón centrar */}
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_CLS[stat.status]}`} />
                          <span className="text-sm font-semibold text-coffee truncate flex-1" title={stat.name}>
                            {stat.name}
                          </span>
                          <button onClick={() => focusCourier(cid)} title="Centrar en mapa"
                            className="shrink-0 text-gray-400 hover:text-brand-600 transition-colors">
                            <MapPin size={14} />
                          </button>
                        </div>

                        {/* Estado + última vez */}
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={`font-medium ${
                            stat.status === 'online'  ? 'text-emerald-600' :
                            stat.status === 'idle'    ? 'text-amber-600'   :
                            stat.status === 'offline' ? 'text-gray-500'    : 'text-blue-600'
                          }`}>{STATUS_LABEL[stat.status]}</span>
                          {stat.lastTs && <span className="text-gray-400">· {timeAgo(stat.lastTs, now)}</span>}
                        </div>

                        {/* KPIs — grid 2x2 */}
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <div className="bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="text-gray-400 mb-0.5">Distancia</div>
                            <div className="font-semibold text-coffee">{fmtDist(stat.totalDistKm)}</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="text-gray-400 mb-0.5">Vel. promedio</div>
                            <div className="font-semibold text-coffee">
                              {stat.avgSpeedKmh > 0 ? `${stat.avgSpeedKmh.toFixed(0)} km/h` : '—'}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="text-gray-400 mb-0.5">En movimiento</div>
                            <div className="font-semibold text-coffee">{fmtDuration(stat.movingSecs)}</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="text-gray-400 mb-0.5">Detenido</div>
                            <div className="font-semibold text-coffee">{fmtDuration(stat.stoppedSecs)}</div>
                          </div>
                        </div>

                        {/* Vel. máxima + puntos registrados */}
                        <div className="flex justify-between text-xs text-gray-500 px-0.5">
                          <span>Vel. máx: <span className="font-medium text-coffee">
                            {stat.maxSpeedKmh > 0 ? `${stat.maxSpeedKmh.toFixed(0)} km/h` : '—'}
                          </span></span>
                          <span className="text-gray-400">{stat.pointCount} pts</span>
                        </div>

                        {/* Horario inicio → última señal */}
                        {stat.firstPoint && stat.lastPoint && (
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <span>{fmtTime(stat.firstPoint.createdAt)}</span>
                            <span>→</span>
                            <span>{fmtTime(stat.lastPoint.createdAt)}</span>
                          </div>
                        )}

                        {/* Barra de color del courier */}
                        <div className="h-0.5 rounded-full" style={{ backgroundColor: color, opacity: 0.4 }} />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Estilos globales */}
      <style jsx global>{`
        @keyframes truck-blink-kf {
          0%   { opacity: 1; }
          50%  { opacity: 0.45; }
          100% { opacity: 1; }
        }
        .leaflet-marker-icon.truck-blink {
          animation: truck-blink-kf 1s infinite;
          filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
        }
        .leaflet-marker-icon.truck-gray {
          filter: grayscale(100%) opacity(0.5);
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        .leaflet-container,
        .leaflet-pane,
        .leaflet-top,
        .leaflet-bottom,
        .leaflet-control {
          z-index: 0 !important;
        }
      `}</style>
    </Layout>
  );
}
