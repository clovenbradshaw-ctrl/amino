import React, { useState, useMemo } from 'react';
import type { BlockSchema } from '../../../state/InterfaceContext';
import { formatCellValue } from '../../../utils/field-types';
import type { FieldType } from '../../../utils/field-types';
import '../../../styles/interface.css';

interface DataTableBlockProps {
  block: BlockSchema;
  onRowClick?: (tableId: string, recordId: string) => void;
}

/**
 * Block config shape:
 * {
 *   tableId: string;
 *   columns: Array<{ fieldId: string; fieldName: string; fieldType: FieldType; width?: number }>;
 *   records: Array<{ recordId: string; fields: Record<string, any> }>;
 *   sorts?: Array<{ fieldName: string; direction: 'asc' | 'desc' }>;
 *   filters?: Array<{ fieldName: string; operator: string; value: any }>;
 *   pageSize?: number;
 * }
 */

export default function DataTableBlock({ block, onRowClick }: DataTableBlockProps) {
  const config = block.config;
  const columns: Array<{ fieldId: string; fieldName: string; fieldType: FieldType; width?: number }> =
    config.columns || [];
  const records: Array<{ recordId: string; fields: Record<string, any> }> = config.records || [];
  const tableId: string = config.tableId || '';
  const pageSize: number = config.pageSize || 25;

  const [page, setPage] = useState(0);

  const paginatedRecords = useMemo(() => {
    const start = page * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));

  return (
    <div className="interface-block">
      {block.title && (
        <div className="interface-block__header">
          <span className="interface-block__title">{block.title}</span>
          <span style={{ fontSize: 11, color: '#999' }}>
            {records.length} record{records.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="data-table-block">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.fieldId} style={col.width ? { width: col.width } : undefined}>
                  {col.fieldName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRecords.length === 0 && (
              <tr>
                <td colSpan={columns.length || 1} style={{ textAlign: 'center', color: '#999', padding: 24 }}>
                  No records
                </td>
              </tr>
            )}
            {paginatedRecords.map(rec => (
              <tr
                key={rec.recordId}
                onClick={() => onRowClick?.(tableId, rec.recordId)}
              >
                {columns.map(col => (
                  <td key={col.fieldId}>
                    {formatCellValue(rec.fields[col.fieldName], col.fieldType)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderTop: '1px solid #eee',
            fontSize: 12,
            color: '#666',
          }}
        >
          <button
            className="interface-btn interface-btn--ghost"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="interface-btn interface-btn--ghost"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
