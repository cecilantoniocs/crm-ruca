// /pages/tracking.js
import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '@/components/Layout';
import axiosClient from '@/config/axios';
import { getCurrentUser, can, isAdmin as isAdminHelper } from '@/helpers/permissions';

// React-Leaflet solo en cliente
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const Polyline     = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

// Cargar Leaflet solo en cliente para evitar "window is not defined"
let L = null;
if (typeof window !== 'undefined') {
  // eslint-disable-next-line global-require
  L = require('leaflet');
}

// ------------ util ------------
const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

// paleta de colores para polilíneas (máx. 5)
const PALETTE = ['2563eb', 'dc2626', '16a34a', 'f97316', '7c3aed'];

// rutas a tus SVG en /public/icons
const TRUCK_ICONS = [
  '/icons/truck1.svg',
  '/icons/truck2.svg',
  '/icons/truck3.svg',
  '/icons/truck4.svg',
  '/icons/truck5.svg',
];

// fabrica un icono de imagen (SVG del /public) con opción de parpadeo
const makeTruckImgIcon = (url, { blink = false } = {}) => {
  if (!L) return undefined;
  return L.icon({
    iconUrl: url,
    iconSize: [36, 36],
    iconAnchor: [18, 30],
    popupAnchor: [0, -26],
    className: blink ? 'truck-blink' : '',
  });
};

export default function TrackingPage() {
  // permisos de vista
  const me = useMemo(() => { try { return getCurrentUser(); } catch { return null; } }, []);
  const canView = isAdminHelper(me) || can('tracking.view', null, me);

  // estado
  const [couriers, setCouriers] = useState([]);
  const [courierId, setCourierId] = useState('all'); // "Todos" por defecto
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [from, setFrom] = useState('00:00'); // 24h
  const [to, setTo] = useState('23:59');     // 24h
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [map, setMap] = useState(null);

  // base map: 'sat' | 'streets' (por defecto CALLES)
  const [basemap, setBasemap] = useState('streets');

  // mapa id->courier (nombre/email)
  const courierMeta = useMemo(() => {
    const m = new Map();
    for (const c of couriers) {
      m.set(c.id, { name: c.name || null, email: c.email || null });
    }
    return m;
  }, [couriers]);

  // índice estable por courier (0..4)
  const colorIndexByCourier = useMemo(() => {
    const ids = couriers.map(c => c.id);
    const mapIdx = new Map();
    ids.forEach((id, i) => mapIdx.set(id, i % PALETTE.length));
    return mapIdx;
  }, [couriers]);

  // ícono según courier + opcional blink
  const iconByCourier = (cid, { blink = false } = {}) => {
    const idx = colorIndexByCourier.get(cid) ?? 0;
    const url = TRUCK_ICONS[idx % TRUCK_ICONS.length];
    return makeTruckImgIcon(url, { blink });
  };

  // cargar repartidores
  useEffect(() => {
    if (!canView) return;
    axiosClient.get('gps/couriers')
      .then(res => setCouriers(res.data || []))
      .catch(() => {});
  }, [canView]);

  // fetch de puntos
  const fetchData = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = { date, from, to };
      if (courierId !== 'all') params.courierId = courierId;

      const { data } = await axiosClient.get('gps/track', { params });

      // anexa nombre y normaliza campos
      const withNames = (Array.isArray(data) ? data : []).map(p => {
        const cid = p.courier_id || p.courierId;
        const meta = courierMeta.get(cid) || {};
        return {
          ...p,
          courierId: cid,
          courierName: p.courier_name || p.courierName || meta.name || meta.email || 'Repartidor',
          createdAt: p.createdAt || p.created_at,
        };
      });

      setPoints(withNames);
    } catch (e) {
      console.error(e);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canView) fetchData(); }, [canView, courierId, date, from, to]); // eslint-disable-line

  // encuadre
  useEffect(() => {
    if (!map) return;
    if (!points?.length) {
      // centro por defecto: La Serena (más cerca)
      map.setView([-29.90453, -71.24894], 11);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const southWest = [Math.min(...lats), Math.min(...lngs)];
    const northEast = [Math.max(...lats), Math.max(...lngs)];
    try { map.fitBounds([southWest, northEast], { padding: [30, 30], maxZoom: 16 }); } catch {}
  }, [map, points]);

  // agrupación por courier (para líneas y para detectar el último punto por courier)
  const groups = useMemo(() => {
    const g = new Map();
    for (const p of points) {
      const cid = p.courierId;
      if (!g.has(cid)) g.set(cid, []);
      g.get(cid).push(p);
    }
    return g;
  }, [points]);

  // set de "keys" de puntos que deben titilar (últimos)
  const blinkingKeys = useMemo(() => {
    const keys = new Set();
    if (!points.length) return keys;

    // helper para identificar un punto
    const keyOf = (p) => p.id ?? `${p.courierId}|${p.lat}|${p.lng}|${p.createdAt}`;

    if (courierId === 'all') {
      // último punto de cada courier
      for (const [, arr] of groups.entries()) {
        if (!arr.length) continue;
        const last = arr[arr.length - 1];
        keys.add(keyOf(last));
      }
    } else {
      // último del arreglo actual (solo 1 courier filtrado en el back)
      const last = points[points.length - 1];
      if (last) keys.add(keyOf(last));
    }
    return keys;
  }, [points, groups, courierId]);

  const lastSeen = useMemo(
    () => (points.length ? points[points.length - 1] : null),
    [points]
  );

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

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header con el mismo estilo que “Pedidos” */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
          <h1 className="text-3xl font-bold text-coffee tracking-tight">
            Tracking de <span className="text-brand-600">Repartidores</span>
          </h1>
        </div>

        {/* Filtros */}
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
                <option key={c.id} value={c.id}>
                  {c.name || c.email} {c.canDeliver ? '•' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Desde</label>
            <input
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Hasta</label>
            <input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            />
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-black"
          >
            {loading ? 'Cargando…' : 'Buscar'}
          </button>

          {/* Ocultar “Última vez visto” cuando es “Todos” */}
          {lastSeen && courierId !== 'all' && (
            <div className="ml-auto text-sm text-gray-700">
              <span className="font-medium">Última vez visto:</span>{' '}
              {new Date(lastSeen.createdAt).toLocaleString()}
              {' · '}
              <a
                className="text-brand-700 underline"
                target="_blank"
                rel="noreferrer"
                href={`https://maps.google.com/?q=${lastSeen.lat},${lastSeen.lng}`}
              >
                Ver en Maps
              </a>
            </div>
          )}
        </div>

        {/* Contenedor relativo para botón flotante y mapa */}
        <div className="relative h-[70vh] w-full rounded-xl overflow-hidden border border-gray-200">
          {/* Botón de capa (z-10 para no sobreponer la sidebar) */}
          <div className="absolute right-3 top-3 z-10">
            <button
              onClick={() => setBasemap(basemap === 'sat' ? 'streets' : 'sat')}
              className="px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur border border-gray-300 text-sm shadow hover:bg-white"
              title="Cambiar base del mapa"
            >
              {basemap === 'sat' ? 'Ver calles' : 'Ver satelital'}
            </button>
          </div>

          <MapContainer
            style={{ height: '100%', width: '100%' }}
            center={[-29.90453, -71.24894]} // La Serena
            zoom={11}
            scrollWheelZoom
            whenCreated={setMap}
          >
            {basemap === 'sat' ? (
              // Satelital (Esri)
              <TileLayer
                attribution="&copy; Esri & OpenStreetMap"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            ) : (
              // Calles (OSM con nombres de calles)
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url={process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
              />
            )}

            {/* Marcadores */}
            {points.map((p) => {
              const key = p.id ?? `${p.courierId}|${p.lat}|${p.lng}|${p.createdAt}`;
              const blink = blinkingKeys.has(key);
              return (
                <Marker
                  key={key}
                  position={[p.lat, p.lng]}
                  icon={iconByCourier(p.courierId, { blink })}
                >
                  <Popup>
                    <div className="text-sm">
                      <div><b>{p.courierName || 'Repartidor'}</b></div>
                      <div><b>Hora:</b> {fmtTime(p.createdAt)}</div>
                      <div><b>Acc:</b> {p.accuracy != null ? `${Math.round(p.accuracy)} m` : '—'}</div>
                      <div className="mt-1">
                        <a
                          className="text-brand-700 underline"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://maps.google.com/?q=${p.lat},${p.lng}`}
                        >
                          Abrir en Google Maps
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Polilíneas por courier */}
            {[...groups.entries()].map(([cid, arr]) =>
              arr.length > 1 ? (
                <Polyline
                  key={`line-${cid}`}
                  positions={arr.map(p => [p.lat, p.lng])}
                  pathOptions={{ color: `#${PALETTE[colorIndexByCourier.get(cid) ?? 0]}`, weight: 3 }}
                />
              ) : null
            )}
          </MapContainer>
        </div>
      </div>

      {/* CSS global para parpadeo del último punto (solo opacidad: no toca transform) */}
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

        /* Mantener Leaflet por debajo de overlays (sidebar, etc.) */
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
