import React from 'react';
import type { InterfacePageSchema, BlockSchema } from '../../../state/InterfaceContext';
import '../../../styles/interface.css';

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

interface PageEditorProps {
  page: InterfacePageSchema;
  onUpdatePage: (updates: Partial<InterfacePageSchema>) => void;
  onAddBlock: (block: BlockSchema) => void;
  onRemoveBlock: (blockId: string) => void;
  onReorderBlocks: (ordered: string[]) => void;
  onSelectBlock: (blockId: string) => void;
  selectedBlockId: string | null;
}

const PAGE_TYPES: Array<{ value: InterfacePageSchema['pageType']; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'detail', label: 'Detail' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'custom', label: 'Custom' },
];

const BLOCK_TYPES: Array<{ value: BlockSchema['blockType']; label: string }> = [
  { value: 'data-table', label: 'Data Table' },
  { value: 'card-list', label: 'Card List' },
  { value: 'detail', label: 'Detail View' },
  { value: 'summary', label: 'Summary Stats' },
  { value: 'text', label: 'Text / HTML' },
  { value: 'chart', label: 'Chart' },
];

export default function PageEditor({
  page,
  onUpdatePage,
  onAddBlock,
  onRemoveBlock,
  onReorderBlocks,
  onSelectBlock,
  selectedBlockId,
}: PageEditorProps) {
  const handleAddBlock = (blockType: BlockSchema['blockType']) => {
    const blockLabel = BLOCK_TYPES.find(bt => bt.value === blockType)?.label || blockType;
    onAddBlock({
      blockId: `blk-${uid()}`,
      blockType,
      title: blockLabel,
      config: {},
    });
  };

  const handleMoveBlock = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= page.blocks.length) return;
    const ids = page.blocks.map(b => b.blockId);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    onReorderBlocks(ids);
  };

  return (
    <div>
      {/* Page settings */}
      <div className="interface-block">
        <div className="interface-block__header">
          <span className="interface-block__title">Page Settings</span>
        </div>
        <div className="interface-block__body">
          <div className="block-editor__field">
            <label className="block-editor__label">Page Name</label>
            <input
              className="block-editor__input"
              value={page.pageName}
              onChange={e => onUpdatePage({ pageName: e.target.value })}
            />
          </div>

          <div className="block-editor__field">
            <label className="block-editor__label">Icon (emoji)</label>
            <input
              className="block-editor__input"
              value={page.icon || ''}
              onChange={e => onUpdatePage({ icon: e.target.value })}
              placeholder="e.g. 📋"
              style={{ width: 80 }}
            />
          </div>

          <div className="block-editor__field">
            <label className="block-editor__label">Page Type</label>
            <select
              className="block-editor__select"
              value={page.pageType}
              onChange={e =>
                onUpdatePage({ pageType: e.target.value as InterfacePageSchema['pageType'] })
              }
            >
              {PAGE_TYPES.map(pt => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="block-editor__field">
            <label className="block-editor__label">
              Role Visibility (comma-separated power levels)
            </label>
            <input
              className="block-editor__input"
              value={(page.roleVisibility || []).join(', ')}
              onChange={e =>
                onUpdatePage({
                  roleVisibility: e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Leave empty for everyone"
            />
          </div>
        </div>
      </div>

      {/* Block list */}
      <div className="interface-block">
        <div className="interface-block__header">
          <span className="interface-block__title">Blocks</span>
          <span style={{ fontSize: 11, color: '#999' }}>
            {page.blocks.length} block{page.blocks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="interface-block__body" style={{ padding: 0 }}>
          {page.blocks.map((block, idx) => (
            <div
              key={block.blockId}
              onClick={() => onSelectBlock(block.blockId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                background:
                  selectedBlockId === block.blockId ? 'var(--color-accent-light, #dbeafe)' : undefined,
              }}
            >
              <span style={{ fontSize: 11, color: '#999', fontFamily: 'var(--font-mono)', minWidth: 60 }}>
                {block.blockType}
              </span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>
                {block.title || block.blockType}
              </span>
              <button
                className="interface-btn interface-btn--ghost"
                style={{ padding: '0 4px', fontSize: 9 }}
                onClick={e => { e.stopPropagation(); handleMoveBlock(idx, -1); }}
              >
                ^
              </button>
              <button
                className="interface-btn interface-btn--ghost"
                style={{ padding: '0 4px', fontSize: 9 }}
                onClick={e => { e.stopPropagation(); handleMoveBlock(idx, 1); }}
              >
                v
              </button>
              <button
                className="interface-btn interface-btn--ghost"
                style={{ padding: '0 4px', fontSize: 11, color: '#c0392b' }}
                onClick={e => { e.stopPropagation(); onRemoveBlock(block.blockId); }}
              >
                x
              </button>
            </div>
          ))}
          {page.blocks.length === 0 && (
            <div style={{ padding: 24, color: '#999', fontSize: 12, textAlign: 'center' }}>
              No blocks yet. Add one below.
            </div>
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BLOCK_TYPES.map(bt => (
            <button
              key={bt.value}
              className="interface-btn"
              onClick={() => handleAddBlock(bt.value)}
            >
              + {bt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
