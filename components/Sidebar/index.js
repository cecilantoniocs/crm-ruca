import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Users, Boxes, Truck, X, BarChart3, UserCog } from 'lucide-react';
import axiosClient from '../../config/axios';

const Sidebar = ({ menuOpen = false, setMenuOpen }) => {
  const router = useRouter();
  const [isAdminUI, setIsAdminUI] = useState(false);

  const hasUsersPerm = (u) => {
    const arr = Array.isArray(u?.permissions) ? u.permissions : [];
    const lower = new Set(arr.map((p) => String(p).toLowerCase()));
    return lower.has('*') || lower.has('users.list') || lower.has('users.read');
  };
  const isAdminFlag = (u) => !!(u?.is_admin || u?.isAdmin);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await axiosClient.get('auth/me');
        const me = data?.user || null;
        if (mounted && me) {
          setIsAdminUI(isAdminFlag(me) || hasUsersPerm(me));
          return;
        }
      } catch {}
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('userData') : null;
        const u = raw ? JSON.parse(raw) : null;
        const roleRaw = (u?.role ?? u?.userRole ?? u?.type ?? '').toString().trim().toLowerCase();
        const hasPerm =
          Array.isArray(u?.permissions) &&
          u.permissions.some((p) =>
            ['users:manage', 'users:view'].includes(String(p).toLowerCase())
          );
        const flag = !!u?.isAdmin;
        if (mounted) {
          setIsAdminUI(roleRaw === 'admin' || roleRaw === 'administrador' || hasPerm || flag);
        }
      } catch {
        if (mounted) setIsAdminUI(false);
      }
    })();
    return () => { mounted = false; };
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
          // ancho: móvil se mantiene 16rem, desktop se estrecha a 14rem
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

          {isAdminUI && (
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
              RookApp v2.0
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
