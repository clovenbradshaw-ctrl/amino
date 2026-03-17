import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { InterfacePageSchema } from '../../state/InterfaceContext';
import '../../styles/interface.css';

interface InterfaceNavProps {
  pages: InterfacePageSchema[];
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
  /** Current user's power level – pages whose roleVisibility doesn't include it are hidden */
  userPowerLevel?: string;
}

const DEFAULT_ICONS: Record<string, string> = {
  list: '\u{1F4CB}',     // clipboard
  detail: '\u{1F4C4}',   // page facing up
  dashboard: '\u{1F4CA}', // bar chart
  custom: '\u{2699}',     // gear
};

export default function InterfaceNav({
  pages,
  activePageId,
  onSelectPage,
  userPowerLevel,
}: InterfaceNavProps) {
  const navigate = useNavigate();

  const visiblePages = pages.filter(p => {
    if (!p.roleVisibility || p.roleVisibility.length === 0) return true;
    if (!userPowerLevel) return true;
    return p.roleVisibility.includes(userPowerLevel);
  });

  return (
    <nav className="interface-nav">
      <div className="interface-nav__header">
        <button
          className="interface-nav__back-btn"
          onClick={() => navigate('/schema')}
          title="Back to main navigation"
        >
          {'\u2190'}
        </button>
        <span className="interface-nav__header-dot" />
        <span className="interface-nav__header-title">Interface</span>
      </div>

      <div className="interface-nav__list">
        {visiblePages.map(page => (
          <button
            key={page.pageId}
            className={`interface-nav__item${activePageId === page.pageId ? ' interface-nav__item--active' : ''}`}
            onClick={() => onSelectPage(page.pageId)}
          >
            <span className="interface-nav__item-icon">
              {page.icon || DEFAULT_ICONS[page.pageType] || DEFAULT_ICONS.custom}
            </span>
            <span className="interface-nav__item-label">{page.pageName}</span>
            <span className="interface-nav__item-badge">{page.pageType}</span>
          </button>
        ))}

        {visiblePages.length === 0 && (
          <div style={{ padding: '24px 16px', color: '#888', fontSize: 12, textAlign: 'center' }}>
            No pages configured.
          </div>
        )}
      </div>
    </nav>
  );
}
