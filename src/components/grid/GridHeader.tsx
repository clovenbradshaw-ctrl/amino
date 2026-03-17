import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FieldDef } from '@/utils/field-types';
import { getFieldIcon } from '@/utils/field-types';
import type { SortConfig } from '@/state/ViewContext';

interface GridHeaderProps {
  fields: FieldDef[];
  sorts: SortConfig[];
  fieldWidths: Record<string, number>;
  onSort: (fieldId: string) => void;
  onResize: (fieldId: string, width: number) => void;
  onReorder: (fieldIds: string[]) => void;
  onAutoFit: (fieldId: string) => void;
  onContextMenu: (e: React.MouseEvent, fieldId: string) => void;
}

const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 80;

/* ---------- Sortable header cell ---------- */
function SortableHeaderCell({
  field,
  width,
  sortIndicator,
  isResizing,
  onSort,
  onContextMenu,
  onResizeStart,
  onAutoFit,
}: {
  field: FieldDef;
  width: number;
  sortIndicator: string | null;
  isResizing: boolean;
  onSort: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onAutoFit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.fieldId });

  const style: React.CSSProperties = {
    width,
    minWidth: width,
    maxWidth: width,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={`grid-header-cell${isDragging ? ' grid-header-cell--dragging' : ''}`}
      style={style}
      onClick={onSort}
      onContextMenu={e => {
        e.preventDefault();
        onContextMenu(e);
      }}
      {...attributes}
      {...listeners}
    >
      <span className="grid-header-cell-icon">{getFieldIcon(field.fieldType)}</span>
      <span className="grid-header-cell-name">{field.fieldName}</span>
      {sortIndicator && (
        <span className="grid-header-cell-sort">{sortIndicator}</span>
      )}
      <div
        className={`grid-resize-handle${isResizing ? ' grid-resize-handle--active' : ''}`}
        onMouseDown={e => {
          e.stopPropagation();
          onResizeStart(e);
        }}
        onDoubleClick={e => {
          e.stopPropagation();
          onAutoFit();
        }}
        // Prevent dnd-kit from capturing resize handle interactions
        onPointerDown={e => e.stopPropagation()}
      />
    </div>
  );
}

/* ---------- Drag overlay (ghost) ---------- */
function DragOverlayCell({
  field,
  width,
  sortIndicator,
}: {
  field: FieldDef;
  width: number;
  sortIndicator: string | null;
}) {
  return (
    <div
      className="grid-header-cell grid-header-cell--overlay"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <span className="grid-header-cell-icon">{getFieldIcon(field.fieldType)}</span>
      <span className="grid-header-cell-name">{field.fieldName}</span>
      {sortIndicator && (
        <span className="grid-header-cell-sort">{sortIndicator}</span>
      )}
    </div>
  );
}

/* ---------- Main GridHeader ---------- */
export function GridHeader({
  fields,
  sorts,
  fieldWidths,
  onSort,
  onResize,
  onReorder,
  onAutoFit,
  onContextMenu,
}: GridHeaderProps) {
  const [resizing, setResizing] = useState<{ fieldId: string; startX: number; startWidth: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [resizeIndicatorX, setResizeIndicatorX] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Drag sensors — require 8px movement to start a drag (so clicks still work)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  /* --- Resize logic --- */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = fieldWidths[fieldId] || DEFAULT_WIDTH;
      setResizing({ fieldId, startX: e.clientX, startWidth });
      setResizeIndicatorX(e.clientX);
    },
    [fieldWidths],
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(MIN_WIDTH, resizing.startWidth + diff);
      onResize(resizing.fieldId, newWidth);
      setResizeIndicatorX(e.clientX);
    };

    const handleMouseUp = () => {
      setResizing(null);
      setResizeIndicatorX(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, onResize]);

  /* --- DnD logic --- */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = fields.findIndex(f => f.fieldId === active.id);
      const newIndex = fields.findIndex(f => f.fieldId === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const newOrder = fields.map(f => f.fieldId);
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, String(active.id));
      onReorder(newOrder);
    },
    [fields, onReorder],
  );

  const getSortIndicator = (fieldId: string): string | null => {
    const sort = sorts.find(s => s.fieldId === fieldId);
    if (!sort) return null;
    return sort.direction === 'asc' ? '\u2191' : '\u2193';
  };

  const activeField = activeId ? fields.find(f => f.fieldId === activeId) : null;

  return (
    <div className="grid-header-row" ref={headerRef}>
      <div className="grid-row-number-header">#</div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map(f => f.fieldId)}
          strategy={horizontalListSortingStrategy}
        >
          {fields.map(field => {
            const width = fieldWidths[field.fieldId] || DEFAULT_WIDTH;
            const sortIndicator = getSortIndicator(field.fieldId);

            return (
              <SortableHeaderCell
                key={field.fieldId}
                field={field}
                width={width}
                sortIndicator={sortIndicator}
                isResizing={resizing?.fieldId === field.fieldId}
                onSort={() => onSort(field.fieldId)}
                onContextMenu={e => onContextMenu(e, field.fieldId)}
                onResizeStart={e => handleResizeStart(e, field.fieldId)}
                onAutoFit={() => onAutoFit(field.fieldId)}
              />
            );
          })}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeField ? (
            <DragOverlayCell
              field={activeField}
              width={fieldWidths[activeField.fieldId] || DEFAULT_WIDTH}
              sortIndicator={getSortIndicator(activeField.fieldId)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Resize indicator line */}
      {resizing && resizeIndicatorX !== null && (
        <div
          className="grid-resize-indicator"
          style={{ left: resizeIndicatorX - (headerRef.current?.getBoundingClientRect().left || 0) }}
        />
      )}
    </div>
  );
}
