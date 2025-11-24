import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Users, Boxes, Truck, X, BarChart3, UserCog, Navigation } from 'lucide-react';
import axiosClient from '../../config/axios';
// 👇 helpers de permisos para verificación estricta
import {
  getCurrentUser as permsGetCurrentUser,
  can as canPerm,
} from '../../helpers/permissions';

const Sidebar = ({ menuOpen = false, setMenuOpen }) => {
  const router = useRouter();
  const [canUsersUI, setCanUsersUI] = useState(false);
  const [canTrackingUI, setCanTrackingUI] = useState(false);

  // Helpers permisos (robustos a mayúsculas/arrays/objeto anidado/flags)
  const normRole = (u) =>
    (u?.role ?? u?.userRole ?? u?.type ?? '')
      .toString()
      .trim()
      .toLowerCase();

  /**
   * Normaliza "u.permissions" a un Set de tokens minúsculos.
   * Soporta:
   *  - Array: ["users:read", ...]
   *  - Objeto: { users: { view: true, ... } }
   *  - String JSON: "[\"users:read\", ...]" o "{\"users\":{\"view\":true}}"
   *  - String plano: "users:read, orders:read"
   */
  const permSetFrom = (u) => {
    let perms = u?.permissions;

    // Si es string, intentamos parsear JSON; si falla, fallback a split por coma
    if (typeof perms === 'string') {
      const s = perms.trim();
      try {
        if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
          perms = JSON.parse(s);
        } else {
          // "users:read, orders:read"
          perms = s
            .replace(/[\[\]"]/g, '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        }
      } catch {
        perms = s
          .replace(/[\[\]"]/g, '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
      }
    }

    // 1) Array de tokens
    if (Array.isArray(perms)) {
      return new Set(perms.map((p) => String(p).toLowerCase()));
    }

    // 2) Objeto anidado { module: { action: bool } }
    if (perms && typeof perms === 'object') {
      const flat = new Set();
      for (const [mod, acts] of Object.entries(perms)) {
        if (acts && typeof acts === 'object') {
          for (const [act, val] of Object.entries(acts)) {
            if (val) flat.add(`${String(mod).toLowerCase()}.${String(act).toLowerCase()}`);
          }
        }
      }
      return flat;
    }

    return new Set();
  };

  const hasUsersPerm = (u) => {
    const lower = permSetFrom(u);
    return (
      lower.has('*') ||
      lower.has('users.list') ||
      lower.has('users.read') ||
      lower.has('users:view') ||
      lower.has('users:manage') ||
      lower.has('users.view')
    );
  };

  const hasTrackingPerm = (u) => {
    const lower = permSetFrom(u);
    return (
      lower.has('*') ||
      lower.has('tracking.view') ||
      lower.has('tracking:view') ||
      lower.has('tracking.read') ||
      lower.has('tracking:read') ||
      lower.has('gps.view') ||
      lower.has('gps.read') ||
      lower.has('locations.view') ||
      lower.has('locations.read')
    );
  };

  const isAdminFlag = (u) => !!(u?.is_admin || u?.isAdmin);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // 1) Intento con API
      try {
        const { data } = await axiosClient.get('auth/me');
        const me = data?.user || null;
        if (mounted && me) {
          const role = normRole(me);
          const admin = isAdminFlag(me) || role === 'admin';
          const supervisor = role === 'supervisor';

          // Heurísticos por tokens del backend (vengan como vengan)
          const usersOkHeur = admin || hasUsersPerm(me);
          const trackOkHeur = admin || supervisor || hasTrackingPerm(me);

          // 🔒 Chequeo estricto contra el usuario normalizado en localStorage
          const localU = permsGetCurrentUser();
          const usersStrict = admin || canPerm('users.view', null, localU) || canPerm('users.read', null, localU);
          const trackStrict = admin || canPerm('tracking.view', null, localU);

          setCanUsersUI(usersOkHeur || usersStrict);             // ver Users si tiene "users.read/view" (aunque sea solo lectura)
          setCanTrackingUI(trackOkHeur && trackStrict);           // tracking requiere pasar ambos
          return;
        }
      } catch {
        // sigue al fallback
      }

      // 2) Fallback localStorage
      try {
        const raw =
          typeof window !== 'undefined' ? localStorage.getItem('userData') : null;
        const u = raw ? JSON.parse(raw) : null;
        const role = normRole(u);
        const admin = !!u?.isAdmin || role === 'admin';
        const supervisor = role === 'supervisor';

        const lower = permSetFrom(u);

        // Heurísticos locales
        const usersOkHeur =
          admin ||
          lower.has('*') ||
          lower.has('users.list') ||
          lower.has('users.read') ||
          lower.has('users:view') ||
          lower.has('users:manage') ||
          lower.has('users.view');

        const trackOkHeur =
          admin ||
          supervisor ||
          lower.has('*') ||
          lower.has('tracking.view') ||
          lower.has('tracking:view') ||
          lower.has('tracking.read') ||
          lower.has('tracking:read') ||
          lower.has('gps.view') ||
          lower.has('gps.read') ||
          lower.has('locations.view') ||
          lower.has('locations.read');

        // 🔒 Estricto con helper (por si el objeto ya está normalizado)
        const localU = permsGetCurrentUser();
        const usersStrict = admin || canPerm('users.view', null, localU) || canPerm('users.read', null, localU);
        const trackStrict = admin || canPerm('tracking.view', null, localU);

        if (mounted) {
          setCanUsersUI(usersOkHeur || usersStrict);
          setCanTrackingUI(trackOkHeur && trackStrict);
        }
      } catch {
        if (mounted) {
          setCanUsersUI(false);
          setCanTrackingUI(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const isActive = (path) =>
    router.pathname === path || router.pathname.startsWith(`${path}/`);

  const navItemClass = (path) =>
    [
      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive(path)
        ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
        : 'text-coffee hover:bg-gray-50',
    ].join(' ');

  const closeMenu = () => {
    if (typeof setMenuOpen === 'function') setMenuOpen(false);
  };

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          aria-label="Cerrar menú"
          title="Cerrar menú"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 w-64 sm:w-56 z-50 sm:z-40',
          'bg-white border-r border-gray-200',
          'flex flex-col h-[100dvh] p-4',
          'transition-transform duration-200',
          menuOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
        ].join(' ')}
      >
        {/* Header + cerrar (móvil) */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-2xl font-black tracking-tight text-coffee">RUCAPELLAN</p>
          <button
            className="sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100"
            onClick={closeMenu}
            aria-label="Cerrar menú"
            title="Cerrar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navegación */}
        <nav className="space-y-1 flex-1">
          <Link href="/client" className={navItemClass('/client')} onClick={closeMenu}>
            <Users size={18} />
            <span>Clientes</span>
          </Link>

          <Link href="/products" className={navItemClass('/products')} onClick={closeMenu}>
            <Boxes size={18} />
            <span>Productos</span>
          </Link>

          <Link href="/orders" className={navItemClass('/orders')} onClick={closeMenu}>
            <Truck size={18} />
            <span>Pedidos</span>
          </Link>

          <Link href="/sales" className={navItemClass('/sales')} onClick={closeMenu}>
            <BarChart3 size={18} />
            <span>Ventas</span>
          </Link>

          {/* Tracking (permiso tracking.view, gps.view, etc.) */}
          {canTrackingUI && (
            <Link
              href="/tracking"
              className={navItemClass('/tracking')}
              onClick={closeMenu}
              title="Seguimiento GPS"
            >
              <Navigation size={18} />
              <span>Tracking</span>
            </Link>
          )}

          {/* Usuarios (mostrar incluso solo con users:read/view) */}
          {canUsersUI && (
            <Link href="/users" className={navItemClass('/users')} onClick={closeMenu}>
              <UserCog size={18} />
              <span>Usuarios</span>
            </Link>
          )}
        </nav>

        {/* Footer */}
        <div className="pt-5">
          <div className="rounded-lg bg-[#000000] text-white text-xs px-3 py-2 font-medium shadow-sm">
            <div className="text-[11px] uppercase tracking-wide opacity-80 mb-0.5">
              RookApp v5.0
            </div>
                        <div className="text-[9px] uppercase tracking-wide opacity-80 mb-0.5">
              Last Update 24-11-25
            </div>
            <div>
              Developed by <span className="font-semibold">Cecil</span> ⚡
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
