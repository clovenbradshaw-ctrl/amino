import React from 'react';
import type { BlockSchema } from '../../../state/InterfaceContext';
import { formatCellValue } from '../../../utils/field-types';
import type { FieldType } from '../../../utils/field-types';
import '../../../styles/interface.css';

interface DetailBlockProps {
  block: BlockSchema;
}

/**
 * Block config shape:
 * {
 *   record: { recordId: string; fields: Record<string, any> } | null;
 *   sections: Array<{
 *     title: string;
 *     fields: Array<{ fieldName: string; fieldType: FieldType }>;
 *   }>;
 *   profileLayoutSchema?: object; // optional profile layout for advanced rendering
 * }
 */

export default function DetailBlock({ block }: DetailBlockProps) {
  const config = block.config;
  const record: { recordId: string; fields: Record<string, any> } | null = config.record || null;
  const sections: Array<{
    title: string;
    fields: Array<{ fieldName: string; fieldType: FieldType }>;
  }> = config.sections || [];

  if (!record) {
    return (
      <div className="interface-block">
        {block.title && (
          <div className="interface-block__header">
            <span className="interface-block__title">{block.title}</span>
          </div>
        )}
        <div className="interface-block__body">
          <div className="interface-empty">
            <div className="interface-empty__message">No record selected.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="interface-block">
      {block.title && (
        <div className="interface-block__header">
          <span className="interface-block__title">{block.title}</span>
        </div>
      )}
      <div className="interface-block__body">
        <div className="detail-view">
          {sections.length === 0 ? (
            <div className="detail-view__section">
              <div className="detail-view__fields">
                {Object.entries(record.fields).map(([name, value]) => (
                  <div className="detail-view__field" key={name}>
                    <span className="detail-view__field-label">{name}</span>
                    <span className="detail-view__field-value">
                      {formatCellValue(value, 'singleLineText')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            sections.map((section, idx) => (
              <div className="detail-view__section" key={idx}>
                {section.title && (
                  <div className="detail-view__section-title">{section.title}</div>
                )}
                <div className="detail-view__fields">
                  {section.fields.map(f => (
                    <div className="detail-view__field" key={f.fieldName}>
                      <span className="detail-view__field-label">{f.fieldName}</span>
                      <span className="detail-view__field-value">
                        {formatCellValue(record.fields[f.fieldName], f.fieldType)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
