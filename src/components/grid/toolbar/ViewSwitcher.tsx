import React, { useState } from 'react';
import { useView, createDefaultView } from '@/state/ViewContext';
import { generateId } from '@/utils/format';
import { classNames } from '@/utils/format';

interface ViewSwitcherProps {
  onClose: () => void;
}

export function ViewSwitcher({ onClose }: ViewSwitcherProps) {
  const { currentView, views, setCurrentView, saveView } = useView();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim() || !currentView) return;
    const newView = {
      ...createDefaultView(currentView.tableId),
      viewId: `view_${generateId()}`,
      viewName: newName.trim(),
    };
    saveView(newView);
    setCurrentView(newView);
    setCreating(false);
    setNewName('');
    onClose();
  };

  const handleSelect = (viewId: string) => {
    const v = views.find(v => v.viewId === viewId);
    if (v) {
      setCurrentView(v);
      onClose();
    }
  };

  return (
    <div>
      <div className="grid-popover-title">Views</div>
      {views.map(v => (
        <div
          key={v.viewId}
          className={classNames(
            'grid-view-item',
            currentView?.viewId === v.viewId && 'grid-view-item--active',
          )}
          onClick={() => handleSelect(v.viewId)}
        >
          {v.viewName}
        </div>
      ))}
      {currentView && !views.some(v => v.viewId === currentView.viewId) && (
        <div className="grid-view-item grid-view-item--active">
          {currentView.viewName}
        </div>
      )}
      <div className="grid-view-create">
        {creating ? (
          <div className="grid-popover-row">
            <input
              type="text"
              placeholder="View name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
              autoFocus
            />
            <button className="grid-btn grid-btn--primary" onClick={handleCreate} style={{ padding: '4px 8px', fontSize: 12 }}>
              Create
            </button>
          </div>
        ) : (
          <button className="grid-popover-add-btn" onClick={() => setCreating(true)}>
            + Create view
          </button>
        )}
      </div>
    </div>
  );
}
