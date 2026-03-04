import React from 'react';
import type { FKPath } from '../../utils/fk-paths';

interface Props {
  paths: FKPath[];
  selectedPath: FKPath | null;
  onSelectPath: (path: FKPath) => void;
}

export default function FKPathPicker({ paths, selectedPath, onSelectPath }: Props) {
  if (paths.length === 0) {
    return (
      <div className="fk-picker fk-picker--empty">
        No linked tables found
      </div>
    );
  }

  return (
    <div className="fk-picker">
      <div className="fk-picker-label">Related Tables</div>
      {paths.map(path => (
        <button
          key={path.path}
          className={`fk-path-item ${selectedPath?.path === path.path ? 'fk-path-item--active' : ''}`}
          onClick={() => onSelectPath(path)}
        >
          <div className="fk-path-breadcrumb">
            {path.segments.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="fk-path-arrow">→</span>}
                <span className="fk-path-table">{seg.tableName}</span>
                <span className="fk-path-field">.{seg.linkFieldName}</span>
              </React.Fragment>
            ))}
            <span className="fk-path-arrow">→</span>
            <span className="fk-path-target">{path.targetTableName}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
