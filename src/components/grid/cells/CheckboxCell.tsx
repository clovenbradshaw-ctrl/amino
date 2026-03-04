import React from 'react';

interface CheckboxCellProps {
  value: any;
  isEditing: boolean;
  onChange: (value: any) => void;
}

export function CheckboxCell({ value, isEditing, onChange }: CheckboxCellProps) {
  const checked = !!value;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(!checked);
  };

  return (
    <div
      className={`grid-cell-checkbox${checked ? ' grid-cell-checkbox--checked' : ''}`}
      onClick={handleToggle}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    />
  );
}
