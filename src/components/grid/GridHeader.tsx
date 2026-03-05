import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { getFieldIcon } from '@/utils/field-types';
import type { SortConfig } from '@/state/ViewContext';

interface GridHeaderProps {
  fields: FieldDef[];
  sorts: SortConfig[];
  fieldWidths: Record<string, number>;
  onSort: (fieldId: string) => void;
  onResize: (fieldId: string, width: number) => void;
  onContextMenu: (e: React.MouseEvent, fieldId: string) => void;
}

const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 80;

export function GridHeader({
  fields,
  sorts,
  fieldWidths,
  onSort,
  onResize,
  onContextMenu,
}: GridHeaderProps) {
  const [resizing, setResizing] = useState<{ fieldId: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = fieldWidths[fieldId] || DEFAULT_WIDTH;
      setResizing({ fieldId, startX: e.clientX, startWidth });
    },
    [fieldWidths],
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(MIN_WIDTH, resizing.startWidth + diff);
      onResize(resizing.fieldId, newWidth);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, onResize]);

  const getSortIndicator = (fieldId: string): string | null => {
    const sort = sorts.find(s => s.fieldId === fieldId);
    if (!sort) return null;
    return sort.direction === 'asc' ? '\u2191' : '\u2193';
  };

  return (
    <div className="grid-header-row">
      <div className="grid-row-number-header">#</div>
      {fields.map(field => {
        const width = fieldWidths[field.fieldId] || DEFAULT_WIDTH;
        const sortIndicator = getSortIndicator(field.fieldId);

        return (
          <div
            key={field.fieldId}
            className="grid-header-cell"
            style={{ width, minWidth: width, maxWidth: width }}
            onClick={() => onSort(field.fieldId)}
            onContextMenu={e => {
              e.preventDefault();
              onContextMenu(e, field.fieldId);
            }}
          >
            <span className="grid-header-cell-icon">{getFieldIcon(field.fieldType)}</span>
            <span className="grid-header-cell-name">{field.fieldName}</span>
            {sortIndicator && (
              <span className="grid-header-cell-sort">{sortIndicator}</span>
            )}
            <div
              className={`grid-resize-handle${resizing?.fieldId === field.fieldId ? ' grid-resize-handle--active' : ''}`}
              onMouseDown={e => handleMouseDown(e, field.fieldId)}
            />
          </div>
        );
      })}
    </div>
  );
}
