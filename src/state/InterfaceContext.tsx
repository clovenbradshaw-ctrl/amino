import React, { createContext, useContext, useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BlockSchema {
  blockId: string;
  blockType: 'data-table' | 'card-list' | 'detail' | 'summary' | 'text' | 'chart';
  title?: string;
  config: Record<string, any>; // block-type-specific configuration
}

export interface InterfacePageSchema {
  pageId: string;
  pageName: string;
  icon?: string;
  pageType: 'list' | 'detail' | 'dashboard' | 'custom';
  blocks: BlockSchema[];
  roleVisibility?: string[]; // power-levels that can see this page
}

/* ------------------------------------------------------------------ */
/*  Context value                                                      */
/* ------------------------------------------------------------------ */

interface InterfaceContextValue {
  pages: InterfacePageSchema[];
  loading: boolean;
  error: string | null;

  /* CRUD */
  addPage: (page: InterfacePageSchema) => void;
  updatePage: (pageId: string, updates: Partial<InterfacePageSchema>) => void;
  removePage: (pageId: string) => void;
  reorderPages: (ordered: string[]) => void;

  /* Block-level helpers */
  addBlock: (pageId: string, block: BlockSchema) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<BlockSchema>) => void;
  removeBlock: (pageId: string, blockId: string) => void;
  reorderBlocks: (pageId: string, ordered: string[]) => void;

  /* Persistence */
  loadFromMatrix: (roomId: string) => Promise<void>;
  saveToMatrix: (roomId: string) => Promise<void>;
}

const InterfaceContext = createContext<InterfaceContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATE_EVENT_TYPE = 'law.firm.interface';

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function InterfaceProvider({ children }: { children: React.ReactNode }) {
  const [pages, setPages] = useState<InterfacePageSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- Page CRUD ---- */

  const addPage = useCallback((page: InterfacePageSchema) => {
    setPages(prev => [...prev, { ...page, pageId: page.pageId || `page-${uid()}` }]);
  }, []);

  const updatePage = useCallback((pageId: string, updates: Partial<InterfacePageSchema>) => {
    setPages(prev => prev.map(p => (p.pageId === pageId ? { ...p, ...updates } : p)));
  }, []);

  const removePage = useCallback((pageId: string) => {
    setPages(prev => prev.filter(p => p.pageId !== pageId));
  }, []);

  const reorderPages = useCallback((ordered: string[]) => {
    setPages(prev => {
      const map = new Map(prev.map(p => [p.pageId, p]));
      return ordered.map(id => map.get(id)!).filter(Boolean);
    });
  }, []);

  /* ---- Block CRUD ---- */

  const addBlock = useCallback((pageId: string, block: BlockSchema) => {
    setPages(prev =>
      prev.map(p =>
        p.pageId === pageId
          ? { ...p, blocks: [...p.blocks, { ...block, blockId: block.blockId || `blk-${uid()}` }] }
          : p,
      ),
    );
  }, []);

  const updateBlock = useCallback(
    (pageId: string, blockId: string, updates: Partial<BlockSchema>) => {
      setPages(prev =>
        prev.map(p =>
          p.pageId === pageId
            ? {
                ...p,
                blocks: p.blocks.map(b => (b.blockId === blockId ? { ...b, ...updates } : b)),
              }
            : p,
        ),
      );
    },
    [],
  );

  const removeBlock = useCallback((pageId: string, blockId: string) => {
    setPages(prev =>
      prev.map(p =>
        p.pageId === pageId ? { ...p, blocks: p.blocks.filter(b => b.blockId !== blockId) } : p,
      ),
    );
  }, []);

  const reorderBlocks = useCallback((pageId: string, ordered: string[]) => {
    setPages(prev =>
      prev.map(p => {
        if (p.pageId !== pageId) return p;
        const map = new Map(p.blocks.map(b => [b.blockId, b]));
        return { ...p, blocks: ordered.map(id => map.get(id)!).filter(Boolean) };
      }),
    );
  }, []);

  /* ---- Persistence via Matrix state events ---- */

  const loadFromMatrix = useCallback(async (roomId: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = JSON.parse(localStorage.getItem('amino_synapse_session') || '{}');
      if (!session.access_token) throw new Error('Not authenticated');

      const homeserver = session.homeserver_url || 'https://app.aminoimmigration.com';
      const resp = await fetch(
        `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${STATE_EVENT_TYPE}/`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );

      if (resp.status === 404) {
        // No config saved yet
        setPages([]);
        setLoading(false);
        return;
      }
      if (!resp.ok) throw new Error(`Matrix fetch failed: ${resp.status}`);

      const data = await resp.json();
      const loaded: InterfacePageSchema[] = Array.isArray(data.pages) ? data.pages : [];
      setPages(loaded);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveToMatrix = useCallback(
    async (roomId: string) => {
      setLoading(true);
      setError(null);
      try {
        const session = JSON.parse(localStorage.getItem('amino_synapse_session') || '{}');
        if (!session.access_token) throw new Error('Not authenticated');

        const homeserver = session.homeserver_url || 'https://app.aminoimmigration.com';
        const resp = await fetch(
          `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${STATE_EVENT_TYPE}/`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pages }),
          },
        );

        if (!resp.ok) throw new Error(`Matrix save failed: ${resp.status}`);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [pages],
  );

  return (
    <InterfaceContext.Provider
      value={{
        pages,
        loading,
        error,
        addPage,
        updatePage,
        removePage,
        reorderPages,
        addBlock,
        updateBlock,
        removeBlock,
        reorderBlocks,
        loadFromMatrix,
        saveToMatrix,
      }}
    >
      {children}
    </InterfaceContext.Provider>
  );
}

export function useInterface() {
  const ctx = useContext(InterfaceContext);
  if (!ctx) throw new Error('useInterface must be used within InterfaceProvider');
  return ctx;
}
