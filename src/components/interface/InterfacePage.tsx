import React from 'react';
import type { InterfacePageSchema } from '../../state/InterfaceContext';
import DataTableBlock from './blocks/DataTableBlock';
import CardListBlock from './blocks/CardListBlock';
import DetailBlock from './blocks/DetailBlock';
import SummaryBlock from './blocks/SummaryBlock';
import '../../styles/interface.css';

interface InterfacePageProps {
  pageSchema: InterfacePageSchema;
  /** Called when a record row / card is clicked */
  onRecordClick?: (tableId: string, recordId: string) => void;
}

export default function InterfacePage({ pageSchema, onRecordClick }: InterfacePageProps) {
  return (
    <div className="interface-main">
      <div className="interface-page__header">
        <h2 className="interface-page__title">
          {pageSchema.icon ? `${pageSchema.icon} ` : ''}
          {pageSchema.pageName}
        </h2>
      </div>

      <div className="interface-page__body">
        {pageSchema.blocks.length === 0 && (
          <div className="interface-empty">
            <div className="interface-empty__icon">+</div>
            <div className="interface-empty__title">No blocks yet</div>
            <div className="interface-empty__message">
              Add blocks to this page using the Interface Builder.
            </div>
          </div>
        )}

        {pageSchema.blocks.map(block => {
          switch (block.blockType) {
            case 'data-table':
              return (
                <DataTableBlock
                  key={block.blockId}
                  block={block}
                  onRowClick={onRecordClick}
                />
              );
            case 'card-list':
              return (
                <CardListBlock
                  key={block.blockId}
                  block={block}
                  onCardClick={onRecordClick}
                />
              );
            case 'detail':
              return <DetailBlock key={block.blockId} block={block} />;
            case 'summary':
              return <SummaryBlock key={block.blockId} block={block} />;
            case 'text':
              return (
                <div key={block.blockId} className="interface-block">
                  {block.title && (
                    <div className="interface-block__header">
                      <span className="interface-block__title">{block.title}</span>
                    </div>
                  )}
                  <div className="interface-block__body">
                    <div dangerouslySetInnerHTML={{ __html: block.config.html || '' }} />
                  </div>
                </div>
              );
            case 'chart':
              return (
                <div key={block.blockId} className="interface-block">
                  <div className="interface-block__header">
                    <span className="interface-block__title">{block.title || 'Chart'}</span>
                  </div>
                  <div className="interface-block__body">
                    <div className="interface-empty">
                      <div className="interface-empty__message">Chart rendering not yet implemented.</div>
                    </div>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
