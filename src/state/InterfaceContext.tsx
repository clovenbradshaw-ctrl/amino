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

/** Pre-built interface pages seeded on first load when no saved config exists. */
function getDefaultPages(): InterfacePageSchema[] {
  return [
    {
      pageId: 'page-dashboard',
      pageName: 'Dashboard',
      icon: '\u{1F4CA}',
      pageType: 'dashboard',
      blocks: [
        {
          blockId: 'blk-dash-summary',
          blockType: 'summary',
          title: 'Case Overview',
          config: {
            metrics: [
              { label: 'Total Cases', fieldName: 'id', aggregation: 'count' },
              { label: 'Active Applications', fieldName: 'id', aggregation: 'count' },
              { label: 'Pending Deadlines', fieldName: 'id', aggregation: 'count' },
              { label: 'Consultations', fieldName: 'id', aggregation: 'count' },
            ],
            records: [],
          },
        },
        {
          blockId: 'blk-dash-text',
          blockType: 'text',
          title: 'Quick Links',
          config: {
            html: '<p><strong>Welcome to Amino.</strong> Use the sidebar to navigate between tables, or use the pages below for pre-built views of your data.</p><ul><li><strong>Client Info</strong> &mdash; View and manage all client records</li><li><strong>Case Master View</strong> &mdash; Full case overview with statuses</li><li><strong>Applications</strong> &mdash; Track application filings and deadlines</li><li><strong>Deadlines</strong> &mdash; Upcoming deadline tracker</li></ul>',
          },
        },
      ],
    },
    {
      pageId: 'page-clients',
      pageName: 'Client Info',
      icon: '\u{1F464}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-clients-table',
          blockType: 'data-table',
          title: 'All Clients',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 50,
          },
        },
      ],
    },
    {
      pageId: 'page-cases',
      pageName: 'Case Master View',
      icon: '\u{1F4C1}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-cases-summary',
          blockType: 'summary',
          title: 'Case Statistics',
          config: {
            metrics: [
              { label: 'Total Cases', fieldName: 'id', aggregation: 'count' },
            ],
            records: [],
          },
        },
        {
          blockId: 'blk-cases-table',
          blockType: 'data-table',
          title: 'All Cases',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 50,
          },
        },
      ],
    },
    {
      pageId: 'page-applications',
      pageName: 'Applications',
      icon: '\u{1F4DD}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-apps-table',
          blockType: 'data-table',
          title: 'All Applications',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 50,
          },
        },
      ],
    },
    {
      pageId: 'page-deadlines',
      pageName: 'Deadlines',
      icon: '\u{23F0}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-deadlines-table',
          blockType: 'data-table',
          title: 'Upcoming Deadlines',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 25,
          },
        },
      ],
    },
    {
      pageId: 'page-consultations',
      pageName: 'Consultations',
      icon: '\u{1F4DE}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-consult-table',
          blockType: 'data-table',
          title: 'Consultation Call Backs',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 25,
          },
        },
      ],
    },
    {
      pageId: 'page-collections',
      pageName: 'Collections',
      icon: '\u{1F4B0}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-collections-table',
          blockType: 'data-table',
          title: 'Collections',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 50,
          },
        },
      ],
    },
    {
      pageId: 'page-attorney',
      pageName: 'Attorney Info',
      icon: '\u{2696}',
      pageType: 'detail',
      blocks: [
        {
          blockId: 'blk-attorney-table',
          blockType: 'data-table',
          title: 'Attorney Information',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 25,
          },
        },
      ],
    },
    {
      pageId: 'page-dev-requests',
      pageName: 'Dev Requests',
      icon: '\u{1F6E0}',
      pageType: 'list',
      blocks: [
        {
          blockId: 'blk-dev-table',
          blockType: 'data-table',
          title: 'Development Requests',
          config: {
            tableId: '',
            columns: [],
            records: [],
            pageSize: 25,
          },
        },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function InterfaceProvider({ children }: { children: React.ReactNode }) {
  // Seed with pre-built pages so users see content on first load
  const [pages, setPages] = useState<InterfacePageSchema[]>(getDefaultPages);
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
        // No config saved yet — use pre-built defaults
        setPages(getDefaultPages());
        setLoading(false);
        return;
      }
      if (!resp.ok) throw new Error(`Matrix fetch failed: ${resp.status}`);

      const data = await resp.json();
      const loaded: InterfacePageSchema[] = Array.isArray(data.pages) ? data.pages : [];
      setPages(loaded.length > 0 ? loaded : getDefaultPages());
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
