import React from 'react';
import type { FKPath } from '../../utils/fk-paths';
import '../../styles/profile-builder.css';

interface Props {
  paths: FKPath[];
  selectedPath: FKPath | null;
  onSelectPath: (path: FKPath) => void;
}

export default function FKPathPicker({ paths, selectedPath, onSelectPath }: Props) {
  if (paths.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
        No FK paths found between these tables.
        The builder will use auto-discovery at render time.
      </div>
    );
  }

  return (
    <div>
      {/* Direct option (no join) */}
      <div
        className={`fk-path-option${selectedPath === null ? ' fk-path-option--selected' : ''}`}
        onClick={() => onSelectPath({ path: '', segments: [], targetTableId: '', targetTableName: '' })}
        style={{ marginBottom: 8 }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>Direct field (no join)</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          Field lives on the root table
        </div>
      </div>

      {paths.map((path, idx) => {
        const isSelected = selectedPath?.path === path.path;
        return (
          <div
            key={path.path || idx}
            className={`fk-path-option${isSelected ? ' fk-path-option--selected' : ''}`}
            onClick={() => onSelectPath(path)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#1b7a4a' : '#555' }}>
                Path {idx + 1}
              </span>
              {path.segments.length === 1 && (
                <span style={{ fontSize: 9, background: '#e8f4f0', color: '#1b7a4a', padding: '1px 6px', borderRadius: 3 }}>
                  Direct
                </span>
              )}
            </div>

            <div className="fk-path-chain">
              {path.segments.map((seg, i) => (
                <React.Fragment key={i}>
                  {i === 0 && (
                    <span className="fk-path-chain__table-tag" style={{ background: '#1b7a4a12', color: '#1b7a4a' }}>
                      {seg.tableName}
                    </span>
                  )}
                  <span className="fk-path-chain__sep">{'\u2192'}</span>
                  <span className="fk-path-chain__field-tag">
                    <strong style={{ color: '#b45309' }}>{seg.linkFieldName}</strong>
                  </span>
                  <span className="fk-path-chain__sep">{'\u2192'}</span>
                </React.Fragment>
              ))}
              <span className="fk-path-chain__table-tag" style={{ background: '#7b2d8b12', color: '#7b2d8b' }}>
                {path.targetTableName}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
