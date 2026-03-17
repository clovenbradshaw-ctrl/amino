import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell() {
  const location = useLocation();
  const hideMainSidebar = location.pathname === '/interface';

  return (
    <div className="app-shell">
      {!hideMainSidebar && <Sidebar />}
      <div className="app-main">
        <Header />
        <div className="app-content">
          <Outlet />
        </div>
      </div>

      <style>{`
        .app-shell {
          display: flex;
          height: 100vh;
          overflow: hidden;
        }

        .app-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .app-content {
          flex: 1;
          overflow: auto;
        }
      `}</style>
    </div>
  );
}
