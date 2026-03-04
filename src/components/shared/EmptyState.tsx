import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="grid-empty">
      {icon && <div className="grid-empty-icon">{icon}</div>}
      <div className="grid-empty-title">{title}</div>
      {description && <div className="grid-empty-description">{description}</div>}
      {actionLabel && onAction && (
        <button className="grid-btn grid-btn--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
