import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LogOut, Menu } from 'lucide-react';

const Header = ({ setMenuOpen }) => {
  const router = useRouter();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('userData');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserName(parsed?.name || '');
      }
    } catch {
      setUserName('');
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('userData');
    localStorage.setItem('isAuth', 'false');
    router.push('/login');
  };

  const initial = (userName || 'U').trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Botón menú (móvil) */}
        <button
          type="button"
          className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50 active:scale-95 transition"
          onClick={() => setMenuOpen?.((v) => !v)}
          aria-label="Abrir menú"
          title="Menú"
        >
          <Menu size={18} />
        </button>

        {/* Marca */}
        <Link href="/" className="text-base sm:text-lg font-semibold tracking-tight text-gray-800">
          <span className="text-gray-900">CRM</span>{' '}
          <span className="text-indigo-600">Rucapellan</span>
        </Link>

        {/* Usuario + Salir bonito */}
        <div className="flex items-center gap-2">
          {userName && (
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1 shadow-sm">
              <div className="h-7 w-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
                {initial}
              </div>
              <span className="text-sm font-medium text-gray-700">{userName}</span>
            </div>
          )}

          {/* Botón salir mejorado */}
          <button
            type="button"
            onClick={logout}
            className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white pl-2 pr-2 sm:pl-3 sm:pr-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm active:scale-95 transition"
            aria-label="Cerrar sesión"
            title="Salir"
          >
            <span className="hidden sm:block">Salir</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm group-hover:from-rose-600 group-hover:to-rose-700">
              <LogOut size={16} />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
