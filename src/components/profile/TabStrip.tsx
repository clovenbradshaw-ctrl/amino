import React, { useState } from 'react';
import type { TabItem } from './ProfileLayoutBuilder';
import '../../styles/profile-builder.css';

interface Props {
  tabs: TabItem[];
  activeTabId: string;
  editable?: boolean;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, name: string) => void;
  onRemoveTab: (tabId: string) => void;
  onReorderTabs?: (ordered: string[]) => void;
}

export default function TabStrip({
  tabs,
  activeTabId,
  editable = true,
  onSelectTab,
  onAddTab,
  onRenameTab,
  onRemoveTab,
}: Props) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  return (
    <div className="tab-strip">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;

        if (!editable) {
          return (
            <button
              key={tab.id}
              className={`tab-strip__btn${isActive ? ' tab-strip__btn--active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.name}
            </button>
          );
        }

        return (
          <div key={tab.id} className="tab-strip__input-wrap">
            {editingTabId === tab.id ? (
              <input
                className={`tab-strip__input${isActive ? ' tab-strip__input--active' : ''}`}
                value={tab.name}
                onChange={e => onRenameTab(tab.id, e.target.value)}
                onBlur={() => setEditingTabId(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter') setEditingTabId(null);
                }}
                autoFocus
                onClick={e => e.stopPropagation()}
                style={{ width: Math.max(65, tab.name.length * 8 + 20) }}
              />
            ) : (
              <input
                className={`tab-strip__input${isActive ? ' tab-strip__input--active' : ''}`}
                value={tab.name}
                readOnly
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={e => {
                  e.stopPropagation();
                  setEditingTabId(tab.id);
                }}
                style={{ width: Math.max(65, tab.name.length * 8 + 20), cursor: 'pointer' }}
              />
            )}
            {tabs.length > 1 && (
              <button
                className="tab-strip__remove"
                onClick={e => {
                  e.stopPropagation();
                  onRemoveTab(tab.id);
                }}
              >
                {'\u00D7'}
              </button>
            )}
          </div>
        );
      })}

      {editable && (
        <button className="tab-strip__add" onClick={onAddTab}>
          +
        </button>
      )}
    </div>
  );
}
