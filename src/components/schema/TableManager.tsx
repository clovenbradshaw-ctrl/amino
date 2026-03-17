import React, { useState } from 'react';
import type { TableInfo } from '../../state/SchemaContext';

interface Props {
  tables: TableInfo[];
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
}

export default function TableManager({ tables, selectedTableId, onSelectTable }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? tables.filter(t => t.tableName.toLowerCase().includes(search.toLowerCase()))
    : tables;

  return (
    <div className="table-manager">
      <div className="tm-header">
        <h3>Tables</h3>
        <span className="tm-count">{tables.length}</span>
      </div>

      <div className="tm-search">
        <input
          type="text"
          placeholder="Search tables…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="tm-list">
        {filtered.map(t => (
          <button
            key={t.tableId}
            className={`tm-item ${t.tableId === selectedTableId ? 'tm-item--active' : ''}`}
            onClick={() => onSelectTable(t.tableId)}
          >
            <span className="tm-item-icon">⊟</span>
            <span className="tm-item-name">{t.tableName || t.tableId}</span>
            {t.fieldCount != null && (
              <span className="tm-item-badge">{t.fieldCount} fields</span>
            )}
            {t.fieldCount == null && t.recordCount != null && (
              <span className="tm-item-badge">{t.recordCount} records</span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="tm-empty">No tables found</div>
        )}
      </div>

      <style>{`
        .table-manager {
          padding: var(--space-md);
        }

        .tm-header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
        }

        .tm-header h3 {
          font-size: var(--text-lg);
          font-weight: 600;
        }

        .tm-count {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          background: var(--color-bg-secondary);
          padding: 2px 6px;
          border-radius: 10px;
        }

        .tm-search input {
          width: 100%;
          padding: 6px var(--space-sm);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          margin-bottom: var(--space-sm);
        }

        .tm-search input:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        .tm-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .tm-item {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          text-align: left;
          font-size: var(--text-sm);
          transition: background var(--transition-fast);
          width: 100%;
        }

        .tm-item:hover {
          background: var(--color-bg-secondary);
        }

        .tm-item--active {
          background: var(--color-accent-light);
          color: var(--color-accent);
          font-weight: 500;
        }

        .tm-item-icon {
          flex-shrink: 0;
          opacity: 0.6;
        }

        .tm-item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tm-item-badge {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          flex-shrink: 0;
        }

        .tm-empty {
          padding: var(--space-xl);
          text-align: center;
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }
      `}</style>
    </div>
  );
}
