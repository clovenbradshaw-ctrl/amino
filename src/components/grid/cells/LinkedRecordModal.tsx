import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/shared/Modal';
import { useData } from '@/state/DataContext';
import { useSchema } from '@/state/SchemaContext';
import { formatCellValue } from '@/utils/field-types';
import type { FieldDef } from '@/utils/field-types';

interface LinkedRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The record IDs (or objects with id) that are linked */
  linkedValues: any[];
  /** The field definition for the link field */
  linkField: FieldDef;
  /** The table ID that the linked records belong to (from field options) */
  linkedTableId?: string;
}

/**
 * Modal that displays linked records in a table view.
 * Resolves record IDs against DataContext and shows field values.
 * Provides a button to hop into the interface view for the linked table.
 */
export function LinkedRecordModal({
  isOpen,
  onClose,
  linkedValues,
  linkField,
  linkedTableId,
}: LinkedRecordModalProps) {
  const data = useData();
  const schema = useSchema();
  const navigate = useNavigate();

  // Determine the target table from field options or try to find it
  const targetTableId = linkedTableId || linkField.options?.linkedTableId || '';

  // Load records and fields for the linked table if we have a tableId
  useEffect(() => {
    if (targetTableId && isOpen) {
      data.loadRecords(targetTableId);
      schema.loadFieldsForTable(targetTableId);
    }
  }, [targetTableId, isOpen, data.loadRecords, schema.loadFieldsForTable]);

  // Extract record IDs from the linked values
  const linkedRecordIds = useMemo(() => {
    return linkedValues.map(v => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return v.id || v.recordId || '';
      return '';
    }).filter(Boolean);
  }, [linkedValues]);

  // Get linked records from DataContext
  const allRecords = data.getRecords(targetTableId);
  const linkedRecords = useMemo(() => {
    if (!targetTableId || allRecords.length === 0) {
      // Fallback: show raw IDs as rows
      return linkedRecordIds.map(id => ({
        recordId: id,
        fields: { 'Record ID': id },
      }));
    }
    // Match by recordId
    const matched = linkedRecordIds
      .map(id => allRecords.find(r => r.recordId === id))
      .filter(Boolean) as typeof allRecords;

    if (matched.length === 0) {
      // No matches found - show raw IDs
      return linkedRecordIds.map(id => ({
        recordId: id,
        fields: { 'Record ID': id },
      }));
    }
    return matched;
  }, [targetTableId, allRecords, linkedRecordIds]);

  // Get fields for the linked table
  const fields = schema.getFields(targetTableId);

  // Determine columns to display (use schema fields if available, else derive from records)
  const displayColumns = useMemo(() => {
    if (fields.length > 0) {
      // Show up to 6 most relevant fields
      return fields.filter(f => !f.isExcluded).slice(0, 6);
    }
    // Derive from record keys
    if (linkedRecords.length > 0) {
      const keys = Object.keys(linkedRecords[0].fields);
      return keys.slice(0, 6).map((key, i) => ({
        fieldId: `derived_${i}`,
        tableId: targetTableId,
        fieldName: key,
        fieldType: 'singleLineText' as const,
        isComputed: false,
        isExcluded: false,
        options: {},
      }));
    }
    return [];
  }, [fields, linkedRecords, targetTableId]);

  // Find the linked table name
  const linkedTable = schema.getTable(targetTableId);
  const tableName = linkedTable?.tableName || linkField.fieldName || 'Linked Records';

  const handleOpenInterface = () => {
    onClose();
    // Navigate to interface view - if we have a tableId, navigate to the table grid
    if (targetTableId) {
      navigate(`/tables/${targetTableId}`);
    } else {
      navigate('/interface');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tableName} width={780}>
      <div className="linked-record-modal">
        <div className="linked-record-modal__toolbar">
          <span className="linked-record-modal__count">
            {linkedRecords.length} record{linkedRecords.length !== 1 ? 's' : ''}
          </span>
          <button
            className="grid-btn grid-btn--primary"
            onClick={handleOpenInterface}
            title="Open in table view"
          >
            Open in Interface
          </button>
        </div>

        <div className="linked-record-modal__table-wrap">
          <table className="linked-record-modal__table">
            <thead>
              <tr>
                {displayColumns.map(col => (
                  <th key={col.fieldId}>{col.fieldName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linkedRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={displayColumns.length || 1}
                    style={{ textAlign: 'center', color: '#999', padding: 24 }}
                  >
                    No linked records found
                  </td>
                </tr>
              )}
              {linkedRecords.map((rec, idx) => (
                <tr key={rec.recordId || idx}>
                  {displayColumns.map(col => (
                    <td key={col.fieldId}>
                      {formatCellValue(rec.fields[col.fieldName], col.fieldType)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
