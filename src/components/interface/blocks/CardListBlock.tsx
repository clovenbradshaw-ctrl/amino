import React, { useState, useMemo } from 'react';
import type { BlockSchema } from '../../../state/InterfaceContext';
import { formatCellValue } from '../../../utils/field-types';
import type { FieldType } from '../../../utils/field-types';
import '../../../styles/interface.css';

interface CardListBlockProps {
  block: BlockSchema;
  onCardClick?: (tableId: string, recordId: string) => void;
}

/**
 * Block config shape:
 * {
 *   tableId: string;
 *   titleField: string;       // field name used as the card title
 *   imageField?: string;      // field name for the card image
 *   displayFields: Array<{ fieldName: string; fieldType: FieldType }>;
 *   records: Array<{ recordId: string; fields: Record<string, any> }>;
 * }
 */

export default function CardListBlock({ block, onCardClick }: CardListBlockProps) {
  const config = block.config;
  const records: Array<{ recordId: string; fields: Record<string, any> }> = config.records || [];
  const titleField: string = config.titleField || '';
  const imageField: string | undefined = config.imageField;
  const displayFields: Array<{ fieldName: string; fieldType: FieldType }> =
    config.displayFields || [];
  const tableId: string = config.tableId || '';

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(rec => {
      const title = String(rec.fields[titleField] ?? '').toLowerCase();
      if (title.includes(q)) return true;
      return displayFields.some(df =>
        String(rec.fields[df.fieldName] ?? '')
          .toLowerCase()
          .includes(q),
      );
    });
  }, [records, search, titleField, displayFields]);

  return (
    <div className="interface-block">
      {block.title && (
        <div className="interface-block__header">
          <span className="interface-block__title">{block.title}</span>
          <span style={{ fontSize: 11, color: '#999' }}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="card-list__search">
        <input
          className="card-list__search-input"
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="interface-block__body">
        {filtered.length === 0 ? (
          <div className="interface-empty">
            <div className="interface-empty__message">No matching records.</div>
          </div>
        ) : (
          <div className="card-list">
            {filtered.map(rec => {
              const imgVal = imageField ? rec.fields[imageField] : undefined;
              const imgUrl =
                imgVal && Array.isArray(imgVal) && imgVal.length > 0
                  ? imgVal[0].url || imgVal[0].thumbnails?.large?.url
                  : typeof imgVal === 'string'
                    ? imgVal
                    : undefined;

              return (
                <div
                  key={rec.recordId}
                  className="record-card"
                  onClick={() => onCardClick?.(tableId, rec.recordId)}
                >
                  {imgUrl && (
                    <img className="record-card__image" src={imgUrl} alt="" loading="lazy" />
                  )}
                  <div className="record-card__title">
                    {String(rec.fields[titleField] ?? rec.recordId)}
                  </div>
                  {displayFields.map(df => (
                    <div className="record-card__field" key={df.fieldName}>
                      <span className="record-card__field-label">{df.fieldName}</span>
                      <span className="record-card__field-value">
                        {formatCellValue(rec.fields[df.fieldName], df.fieldType)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
