import React, { useEffect, useMemo } from 'react';
import type { BlockSchema } from '../../../state/InterfaceContext';
import { useData } from '../../../state/DataContext';
import { useSchema } from '../../../state/SchemaContext';
import { formatCellValue } from '../../../utils/field-types';
import type { FieldType } from '../../../utils/field-types';
import '../../../styles/interface.css';

interface DetailBlockProps {
  block: BlockSchema;
}

/**
 * Block config shape:
 * {
 *   tableId?: string;
 *   recordId?: string;
 *   record: { recordId: string; fields: Record<string, any> } | null;
 *   sections: Array<{
 *     title: string;
 *     fields: Array<{ fieldName: string; fieldType: FieldType }>;
 *   }>;
 *   profileLayoutSchema?: object;
 * }
 */

export default function DetailBlock({ block }: DetailBlockProps) {
  const config = block.config;
  const tableId: string = config.tableId || '';
  const recordId: string = config.recordId || '';

  const dataCtx = useData();
  const schemaCtx = useSchema();

  // Load live data when a tableId is configured
  useEffect(() => {
    if (tableId) {
      dataCtx.loadRecords(tableId);
      schemaCtx.loadFieldsForTable(tableId);
    }
  }, [tableId, dataCtx.loadRecords, schemaCtx.loadFieldsForTable]);

  // Resolve the record: prefer live data from DataContext
  const liveRecord = tableId && recordId ? dataCtx.getRecord(tableId, recordId) : undefined;
  const record = useMemo(() => {
    if (liveRecord) {
      return { recordId: liveRecord.recordId, fields: liveRecord.fields };
    }
    return config.record || null;
  }, [liveRecord, config.record]);

  // Build sections from schema fields if available and no sections configured
  const liveFields = schemaCtx.getFields(tableId);
  const sections: Array<{
    title: string;
    fields: Array<{ fieldName: string; fieldType: FieldType }>;
  }> = useMemo(() => {
    if (config.sections && config.sections.length > 0) return config.sections;
    if (tableId && liveFields.length > 0) {
      return [{
        title: '',
        fields: liveFields
          .filter(f => !f.isExcluded)
          .map(f => ({ fieldName: f.fieldName, fieldType: f.fieldType })),
      }];
    }
    return [];
  }, [config.sections, tableId, liveFields]);

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
