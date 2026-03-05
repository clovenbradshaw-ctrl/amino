import React, { useState, useEffect } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useSchema, type TableInfo } from '../../state/SchemaContext';
import { useAuth } from '../../state/AuthContext';

export default function Sidebar() {
  const { tables, loading, loadTables } = useSchema();
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const filteredTables = search
    ? tables.filter(t => t.tableName.toLowerCase().includes(search.toLowerCase()))
    : tables;

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <span className="sidebar-logo">Amino</span>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {!collapsed && (
        <>
          <nav className="sidebar-nav">
            <div className="sidebar-section">
              <div className="sidebar-section-title">Navigation</div>
              <NavLink to="/interface" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
                <span className="sidebar-link-icon">◈</span>
                <span>Interface</span>
              </NavLink>
              <NavLink to="/builder/interface" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
                <span className="sidebar-link-icon">⚙</span>
                <span>Interface Builder</span>
              </NavLink>
              <NavLink to="/builder/profile" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
                <span className="sidebar-link-icon">☷</span>
                <span>Profile Builder</span>
              </NavLink>
              <NavLink to="/schema" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
                <span className="sidebar-link-icon">⊞</span>
                <span>Schema</span>
              </NavLink>
            </div>

            <div className="sidebar-section">
              <div className="sidebar-section-title">
                Tables {loading && <span className="sidebar-spinner">⟳</span>}
              </div>
              <div className="sidebar-search">
                <input
                  type="text"
                  placeholder="Search tables…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="sidebar-search-input"
                />
              </div>
              <div className="sidebar-table-list">
                {filteredTables.map(t => (
                  <NavLink
                    key={t.tableId}
                    to={`/tables/${t.tableId}`}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
                    title={t.tableName}
                  >
                    <span className="sidebar-link-icon">⊟</span>
                    <span className="sidebar-link-text">{t.tableName || t.tableId}</span>
                    {t.fieldCount != null && (
                      <span className="sidebar-link-badge">{t.fieldCount}</span>
                    )}
                  </NavLink>
                ))}
                {filteredTables.length === 0 && !loading && (
                  <div className="sidebar-empty">
                    {search ? 'No matching tables' : 'No tables loaded'}
                  </div>
                )}
              </div>
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <span className="sidebar-user-name" title={session?.userId}>
                {session?.displayName || session?.userId?.split(':')[0]?.replace('@', '') || 'User'}
              </span>
            </div>
            <button className="sidebar-logout" onClick={logout} title="Sign out">
              Sign out
            </button>
          </div>
        </>
      )}

      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          background: var(--color-bg-sidebar);
          color: var(--color-text-sidebar);
          display: flex;
          flex-direction: column;
          height: 100%;
          transition: width var(--transition-normal);
          overflow: hidden;
          flex-shrink: 0;
        }

        .sidebar--collapsed {
          width: var(--sidebar-collapsed-width);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-lg);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .sidebar-logo {
          font-size: var(--text-xl);
          font-weight: 700;
          color: var(--color-text-sidebar-active);
        }

        .sidebar-toggle {
          color: var(--color-text-sidebar);
          font-size: 10px;
          padding: var(--space-xs);
          border-radius: var(--radius-sm);
          opacity: 0.6;
        }

        .sidebar-toggle:hover {
          opacity: 1;
          background: var(--color-bg-sidebar-hover);
        }

        .sidebar-nav {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-sm) 0;
        }

        .sidebar-section {
          margin-bottom: var(--space-lg);
        }

        .sidebar-section-title {
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(255,255,255,0.4);
          padding: var(--space-sm) var(--space-lg);
          display: flex;
          align-items: center;
          gap: var(--space-xs);
        }

        .sidebar-spinner {
          animation: spin 1s linear infinite;
          display: inline-block;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sidebar-search {
          padding: 0 var(--space-md);
          margin-bottom: var(--space-xs);
        }

        .sidebar-search-input {
          width: 100%;
          padding: 6px var(--space-sm);
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-sm);
          color: var(--color-text-sidebar);
          font-size: var(--text-sm);
        }

        .sidebar-search-input::placeholder {
          color: rgba(255,255,255,0.3);
        }

        .sidebar-search-input:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        .sidebar-table-list {
          max-height: 50vh;
          overflow-y: auto;
        }

        .sidebar-link {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: 6px var(--space-lg);
          color: var(--color-text-sidebar);
          text-decoration: none;
          font-size: var(--text-sm);
          transition: background var(--transition-fast);
          white-space: nowrap;
          overflow: hidden;
        }

        .sidebar-link:hover {
          background: var(--color-bg-sidebar-hover);
          text-decoration: none;
        }

        .sidebar-link--active {
          background: var(--color-bg-sidebar-active);
          color: var(--color-text-sidebar-active);
        }

        .sidebar-link-icon {
          flex-shrink: 0;
          width: 16px;
          text-align: center;
          opacity: 0.7;
        }

        .sidebar-link-text {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-link-badge {
          margin-left: auto;
          font-size: var(--text-xs);
          opacity: 0.5;
          flex-shrink: 0;
        }

        .sidebar-empty {
          padding: var(--space-md) var(--space-lg);
          font-size: var(--text-sm);
          color: rgba(255,255,255,0.3);
          font-style: italic;
        }

        .sidebar-footer {
          padding: var(--space-md) var(--space-lg);
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sidebar-user-name {
          font-size: var(--text-sm);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 140px;
        }

        .sidebar-logout {
          font-size: var(--text-xs);
          color: rgba(255,255,255,0.5);
          padding: var(--space-xs) var(--space-sm);
          border-radius: var(--radius-sm);
        }

        .sidebar-logout:hover {
          color: var(--color-text-sidebar-active);
          background: var(--color-bg-sidebar-hover);
        }
      `}</style>
    </aside>
  );
}
