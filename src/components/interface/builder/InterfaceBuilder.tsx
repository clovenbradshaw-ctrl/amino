import React, { useState } from 'react';
import { useInterface } from '../../../state/InterfaceContext';
import type { InterfacePageSchema } from '../../../state/InterfaceContext';
import PageEditor from './PageEditor';
import BlockEditor from './BlockEditor';
import InterfacePage from '../InterfacePage';
import '../../../styles/interface.css';

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export default function InterfaceBuilder() {
  const {
    pages,
    addPage,
    removePage,
    reorderPages,
    updatePage,
    addBlock,
    updateBlock,
    removeBlock,
    reorderBlocks,
  } = useInterface();

  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    pages.length > 0 ? pages[0].pageId : null,
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const selectedPage = pages.find(p => p.pageId === selectedPageId) || null;
  const selectedBlock =
    selectedPage?.blocks.find(b => b.blockId === selectedBlockId) || null;

  const handleAddPage = () => {
    const newPage: InterfacePageSchema = {
      pageId: `page-${uid()}`,
      pageName: `Page ${pages.length + 1}`,
      pageType: 'list',
      blocks: [],
    };
    addPage(newPage);
    setSelectedPageId(newPage.pageId);
    setSelectedBlockId(null);
  };

  const handleRemovePage = (pageId: string) => {
    removePage(pageId);
    if (selectedPageId === pageId) {
      const remaining = pages.filter(p => p.pageId !== pageId);
      setSelectedPageId(remaining.length > 0 ? remaining[0].pageId : null);
      setSelectedBlockId(null);
    }
  };

  const handleMovePageUp = (idx: number) => {
    if (idx <= 0) return;
    const ids = pages.map(p => p.pageId);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    reorderPages(ids);
  };

  const handleMovePageDown = (idx: number) => {
    if (idx >= pages.length - 1) return;
    const ids = pages.map(p => p.pageId);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    reorderPages(ids);
  };

  return (
    <div className="interface-builder">
      {/* Page list sidebar */}
      <div className="interface-builder__sidebar">
        <div className="interface-builder__sidebar-header">Pages</div>
        <div className="interface-builder__page-list">
          {pages.map((page, idx) => (
            <div key={page.pageId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className={`interface-builder__page-item${selectedPageId === page.pageId ? ' interface-builder__page-item--active' : ''}`}
                onClick={() => {
                  setSelectedPageId(page.pageId);
                  setSelectedBlockId(null);
                  setPreviewing(false);
                }}
              >
                <span>{page.icon || '\u{1F4C4}'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {page.pageName}
                </span>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                <button
                  className="interface-btn interface-btn--ghost"
                  style={{ padding: '0 4px', fontSize: 9 }}
                  onClick={() => handleMovePageUp(idx)}
                  title="Move up"
                >
                  ^
                </button>
                <button
                  className="interface-btn interface-btn--ghost"
                  style={{ padding: '0 4px', fontSize: 9 }}
                  onClick={() => handleMovePageDown(idx)}
                  title="Move down"
                >
                  v
                </button>
              </div>
              <button
                className="interface-btn interface-btn--ghost"
                style={{ padding: '0 4px', fontSize: 11, color: '#c0392b' }}
                onClick={() => handleRemovePage(page.pageId)}
                title="Remove page"
              >
                x
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: 8, borderTop: '1px solid #e0e0e0' }}>
          <button className="interface-btn interface-btn--primary" style={{ width: '100%' }} onClick={handleAddPage}>
            + Add Page
          </button>
        </div>
      </div>

      {/* Main editing area */}
      <div className="interface-builder__main">
        <div className="interface-builder__toolbar">
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            {selectedPage ? selectedPage.pageName : 'No page selected'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {selectedPage && (
              <button
                className={`interface-btn${previewing ? ' interface-btn--primary' : ''}`}
                onClick={() => setPreviewing(!previewing)}
              >
                {previewing ? 'Edit' : 'Preview'}
              </button>
            )}
          </div>
        </div>

        <div className="interface-builder__canvas">
          {!selectedPage && (
            <div className="interface-empty">
              <div className="interface-empty__title">Select or create a page</div>
              <div className="interface-empty__message">
                Use the sidebar to manage your interface pages.
              </div>
            </div>
          )}

          {selectedPage && previewing && <InterfacePage pageSchema={selectedPage} />}

          {selectedPage && !previewing && (
            <PageEditor
              page={selectedPage}
              onUpdatePage={updates => updatePage(selectedPage.pageId, updates)}
              onAddBlock={block => addBlock(selectedPage.pageId, block)}
              onRemoveBlock={blockId => {
                removeBlock(selectedPage.pageId, blockId);
                if (selectedBlockId === blockId) setSelectedBlockId(null);
              }}
              onReorderBlocks={ordered => reorderBlocks(selectedPage.pageId, ordered)}
              onSelectBlock={blockId => setSelectedBlockId(blockId)}
              selectedBlockId={selectedBlockId}
            />
          )}
        </div>
      </div>

      {/* Block editor panel */}
      {selectedPage && selectedBlock && !previewing && (
        <BlockEditor
          block={selectedBlock}
          onUpdate={updates => updateBlock(selectedPage.pageId, selectedBlock.blockId, updates)}
          onClose={() => setSelectedBlockId(null)}
        />
      )}
    </div>
  );
}
