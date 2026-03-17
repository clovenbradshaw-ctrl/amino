import React, { useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FieldDef } from '@/utils/field-types';
import { getFieldIcon } from '@/utils/field-types';
import { useView } from '@/state/ViewContext';
import { classNames } from '@/utils/format';

interface FieldsPanelProps {
  fields: FieldDef[];
  onClose: () => void;
}

function SortableFieldItem({
  field,
  isVisible,
  onToggle,
}: {
  field: FieldDef;
  isVisible: boolean;
  onToggle: () => void;
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
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={classNames('fields-panel-item', isDragging && 'fields-panel-item--dragging')}
      style={style}
    >
      <span className="fields-panel-item-drag" {...attributes} {...listeners}>
        &#x2630;
      </span>
      <span className="fields-panel-item-icon">{getFieldIcon(field.fieldType)}</span>
      <span className="fields-panel-item-name">{field.fieldName}</span>
      <button
        className={classNames(
          'fields-panel-item-toggle',
          isVisible && 'fields-panel-item-toggle--on',
        )}
        onClick={onToggle}
        aria-label={isVisible ? 'Hide field' : 'Show field'}
      >
        <span className="fields-panel-item-toggle-knob" />
      </button>
    </div>
  );
}

export function FieldsPanel({ fields, onClose }: FieldsPanelProps) {
  const view = useView();
  const { currentView } = view;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Derive the ordered list: use fieldOrder if set, else natural order
  const orderedFields = React.useMemo(() => {
    if (!currentView || currentView.fieldOrder.length === 0) return fields;
    const orderMap = new Map(currentView.fieldOrder.map((id, i) => [id, i]));
    return [...fields].sort(
      (a, b) => (orderMap.get(a.fieldId) ?? 999) - (orderMap.get(b.fieldId) ?? 999),
    );
  }, [fields, currentView]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = orderedFields.map(f => f.fieldId);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const newOrder = [...ids];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, String(active.id));
      view.setFieldOrder(newOrder);
    },
    [orderedFields, view],
  );

  const handleShowAll = () => {
    if (!currentView) return;
    // Remove all hidden field ids
    for (const id of currentView.hiddenFieldIds) {
      view.toggleFieldVisibility(id);
    }
  };

  const handleHideAll = () => {
    if (!currentView) return;
    for (const f of fields) {
      if (!currentView.hiddenFieldIds.includes(f.fieldId)) {
        view.toggleFieldVisibility(f.fieldId);
      }
    }
  };

  if (!currentView) return null;

  return (
    <div className="fields-panel">
      <div className="fields-panel-header">
        <span className="fields-panel-title">Fields</span>
        <button className="fields-panel-close" onClick={onClose}>&times;</button>
      </div>

      <div className="fields-panel-actions">
        <button className="fields-panel-action-btn" onClick={handleShowAll}>
          Show all
        </button>
        <button className="fields-panel-action-btn" onClick={handleHideAll}>
          Hide all
        </button>
      </div>

      <div className="fields-panel-list">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedFields.map(f => f.fieldId)}
            strategy={verticalListSortingStrategy}
          >
            {orderedFields.map(field => (
              <SortableFieldItem
                key={field.fieldId}
                field={field}
                isVisible={!currentView.hiddenFieldIds.includes(field.fieldId)}
                onToggle={() => view.toggleFieldVisibility(field.fieldId)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
