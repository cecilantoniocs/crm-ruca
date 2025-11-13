import React, { useState } from 'react';
import Sidebar from '../Sidebar';
import Header from '../Header';
import CourierLocationBeacon from '@/components/CourierLocationBeacon'; // <- NUEVO

const Layout = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-[100dvh]">
      <Sidebar menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <div className="sm:pl-56 flex min-h-[100dvh] flex-col">
        <Header setMenuOpen={setMenuOpen} />
        <main className="flex-1 p-5 bg-gray-50">{children}</main>
      </div>

      {/* Montado globalmente: reporta solo si el user puede */}
      <CourierLocationBeacon />
    </div>
  );
};

export default Layout;
