import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useSchema } from '../../state/SchemaContext';

export default function Header() {
  const location = useLocation();
  const params = useParams();
  const { getTable } = useSchema();

  let title = 'Amino';
  let subtitle = '';

  if (location.pathname.startsWith('/tables/') && params.tableId) {
    const table = getTable(params.tableId);
    title = table?.tableName || params.tableId;
    subtitle = 'Database';
  } else if (location.pathname === '/interface') {
    title = 'Interface';
    subtitle = 'Portal pages';
  } else if (location.pathname === '/builder/interface') {
    title = 'Interface Builder';
    subtitle = 'Design portal pages';
  } else if (location.pathname === '/builder/profile') {
    title = 'Profile Layout Builder';
    subtitle = 'Design record detail layouts';
  } else if (location.pathname === '/schema') {
    title = 'Schema Designer';
    subtitle = 'Manage tables and fields';
  }

  return (
    <header className="app-header">
      <div className="header-title-group">
        <h1 className="header-title">{title}</h1>
        {subtitle && <span className="header-subtitle">{subtitle}</span>}
      </div>

      <style>{`
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md) var(--space-xl);
          border-bottom: 1px solid var(--color-border-light);
          background: var(--color-bg-primary);
          min-height: 48px;
          flex-shrink: 0;
        }

        .header-title-group {
          display: flex;
          align-items: baseline;
          gap: var(--space-sm);
        }

        .header-title {
          font-size: var(--text-xl);
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .header-subtitle {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }
      `}</style>
    </header>
  );
}
