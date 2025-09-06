import React, { useState } from 'react';
import Sidebar from '../Sidebar';
import Header from '../Header';

const Layout = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-[100dvh]">
      {/* Sidebar fijo */}
      <Sidebar menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* Contenido principal (desplazado a la derecha en desktop) */}
      <div className="sm:pl-64 flex min-h-[100dvh] flex-col">
        <Header setMenuOpen={setMenuOpen} />
        <main className="flex-1 p-5 bg-gray-50">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
