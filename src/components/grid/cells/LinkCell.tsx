import React, { useState } from 'react';
import { formatCellValue } from '@/utils/field-types';

interface LinkCellProps {
  value: any;
  isEditing: boolean;
  onChange: (value: any) => void;
}

export function LinkCell({ value }: LinkCellProps) {
  const [expanded, setExpanded] = useState(false);
  const links: any[] = Array.isArray(value) ? value : [];

  if (links.length === 0) return null;

  const displayText = formatCellValue(value, 'multipleRecordLinks');

  return (
    <div>
      <span
        className="grid-cell-record-links"
        onClick={e => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
      >
        {displayText}
      </span>
      {expanded && links.length > 0 && (
        <div style={{ fontSize: 11, marginTop: 2 }}>
          {links.map((link, i) => (
            <div key={i} style={{ opacity: 0.7 }}>
              {typeof link === 'string' ? link : link.id || link.name || JSON.stringify(link)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
