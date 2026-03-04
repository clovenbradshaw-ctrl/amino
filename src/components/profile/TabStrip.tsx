import React, { useState } from 'react';
import type { TabItem } from './ProfileLayoutBuilder';

interface Props {
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, name: string) => void;
  onRemoveTab: (tabId: string) => void;
}

export default function TabStrip({ tabs, activeTabId, onSelectTab, onAddTab, onRenameTab, onRemoveTab }: Props) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  return (
    <div className="tab-strip">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`ts-tab ${tab.id === activeTabId ? 'ts-tab--active' : ''}`}
          onClick={() => onSelectTab(tab.id)}
        >
          {editingTabId === tab.id ? (
            <input
              className="ts-tab-input"
              value={tab.name}
              onChange={e => onRenameTab(tab.id, e.target.value)}
              onBlur={() => setEditingTabId(null)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingTabId(null); }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="ts-tab-name"
              onDoubleClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); }}
            >
              {tab.name}
            </span>
          )}
          {tabs.length > 1 && (
            <button
              className="ts-tab-close"
              onClick={(e) => { e.stopPropagation(); onRemoveTab(tab.id); }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button className="ts-add-tab" onClick={onAddTab}>
        +
      </button>
    </div>
  );
}
