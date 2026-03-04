import React, { useState, useRef } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { useView } from '@/state/ViewContext';
import { classNames } from '@/utils/format';
import { FilterBuilder } from './FilterBuilder';
import { SortConfig } from './SortConfig';
import { GroupConfig } from './GroupConfig';
import { ViewSwitcher } from './ViewSwitcher';

interface GridToolbarProps {
  fields: FieldDef[];
  totalRows: number;
}

type OpenPanel = 'sort' | 'filter' | 'group' | 'hideFields' | 'viewSwitcher' | null;

export function GridToolbar({ fields, totalRows }: GridToolbarProps) {
  const view = useView();
  const { currentView } = view;
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);

  const togglePanel = (panel: OpenPanel) => {
    setOpenPanel(prev => (prev === panel ? null : panel));
  };

  if (!currentView) return null;

  const hasSorts = currentView.sorts.length > 0;
  const hasFilters = currentView.filters.length > 0;
  const hasGroup = currentView.groupByFieldId !== null;
  const hasHidden = currentView.hiddenFieldIds.length > 0;

  return (
    <div className="grid-toolbar-area">
      <div className="grid-toolbar">
        <div className="grid-toolbar-left">
          <div className="grid-view-switcher" style={{ position: 'relative' }}>
            <span
              className="grid-toolbar-view-name"
              onClick={() => togglePanel('viewSwitcher')}
            >
              {currentView.viewName}
            </span>
            {openPanel === 'viewSwitcher' && (
              <>
                <div className="grid-popover-backdrop" onClick={() => setOpenPanel(null)} />
                <div className="grid-popover grid-view-list">
                  <ViewSwitcher onClose={() => setOpenPanel(null)} />
                </div>
              </>
            )}
          </div>

          <div className="grid-toolbar-search">
            <span style={{ opacity: 0.5 }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search..."
              value={currentView.searchQuery}
              onChange={e => view.setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className={classNames('grid-toolbar-btn', hasSorts && 'grid-toolbar-btn--active')}
              onClick={() => togglePanel('sort')}
            >
              <span className="grid-toolbar-btn-icon">{'\u2195'}</span>
              Sort{hasSorts ? ` (${currentView.sorts.length})` : ''}
            </button>
            {openPanel === 'sort' && (
              <>
                <div className="grid-popover-backdrop" onClick={() => setOpenPanel(null)} />
                <div className="grid-popover">
                  <SortConfig fields={fields} />
                </div>
              </>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className={classNames('grid-toolbar-btn', hasFilters && 'grid-toolbar-btn--active')}
              onClick={() => togglePanel('filter')}
            >
              <span className="grid-toolbar-btn-icon">{'\u2AF6'}</span>
              Filter{hasFilters ? ` (${currentView.filters.length})` : ''}
            </button>
            {openPanel === 'filter' && (
              <>
                <div className="grid-popover-backdrop" onClick={() => setOpenPanel(null)} />
                <div className="grid-popover">
                  <FilterBuilder fields={fields} />
                </div>
              </>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className={classNames('grid-toolbar-btn', hasGroup && 'grid-toolbar-btn--active')}
              onClick={() => togglePanel('group')}
            >
              <span className="grid-toolbar-btn-icon">{'\u2261'}</span>
              Group{hasGroup ? ' (1)' : ''}
            </button>
            {openPanel === 'group' && (
              <>
                <div className="grid-popover-backdrop" onClick={() => setOpenPanel(null)} />
                <div className="grid-popover">
                  <GroupConfig fields={fields} />
                </div>
              </>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className={classNames('grid-toolbar-btn', hasHidden && 'grid-toolbar-btn--active')}
              onClick={() => togglePanel('hideFields')}
            >
              <span className="grid-toolbar-btn-icon">{'\u2205'}</span>
              Hide fields{hasHidden ? ` (${currentView.hiddenFieldIds.length})` : ''}
            </button>
            {openPanel === 'hideFields' && (
              <>
                <div className="grid-popover-backdrop" onClick={() => setOpenPanel(null)} />
                <div className="grid-popover">
                  <div className="grid-popover-title">Toggle field visibility</div>
                  <div className="grid-hidden-fields-list">
                    {fields.map(f => {
                      const hidden = currentView.hiddenFieldIds.includes(f.fieldId);
                      return (
                        <div
                          key={f.fieldId}
                          className="grid-hidden-field-item"
                          onClick={() => view.toggleFieldVisibility(f.fieldId)}
                        >
                          <div
                            className={classNames(
                              'grid-hidden-field-toggle',
                              !hidden && 'grid-hidden-field-toggle--on',
                            )}
                          />
                          <span>{f.fieldName}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid-toolbar-right">
          {totalRows} record{totalRows !== 1 ? 's' : ''}
        </div>
      </div>

      {hasFilters && (
        <div className="grid-filter-pills">
          {currentView.filters.map(f => {
            const field = fields.find(fd => fd.fieldId === f.fieldId);
            return (
              <span key={f.id} className="grid-filter-pill">
                {field?.fieldName || f.fieldId} {f.operator} {f.value != null ? String(f.value) : ''}
                <span
                  className="grid-filter-pill-remove"
                  onClick={() => view.removeFilter(f.id)}
                >
                  &times;
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
