import React, { useState } from 'react';
import { formatCellValue } from '@/utils/field-types';
import type { FieldDef } from '@/utils/field-types';
import { LinkedRecordModal } from './LinkedRecordModal';

interface LinkCellProps {
  value: any;
  isEditing: boolean;
  onChange: (value: any) => void;
  field?: FieldDef;
}

export function LinkCell({ value, field }: LinkCellProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const links: any[] = Array.isArray(value) ? value : [];

  if (links.length === 0) return null;

  const displayText = formatCellValue(value, 'multipleRecordLinks');

  return (
    <div>
      <span
        className="grid-cell-record-links"
        onClick={e => {
          e.stopPropagation();
          setModalOpen(true);
        }}
      >
        {displayText}
      </span>
      {field && (
        <LinkedRecordModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          linkedValues={links}
          linkField={field}
          linkedTableId={field.options?.linkedTableId}
        />
      )}
    </div>
  );
}
