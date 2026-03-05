import React from 'react';
import type { BlockSchema } from '../../../state/InterfaceContext';
import '../../../styles/interface.css';

interface BlockEditorProps {
  block: BlockSchema;
  onUpdate: (updates: Partial<BlockSchema>) => void;
  onClose: () => void;
}

const BLOCK_TYPE_OPTIONS: Array<{ value: BlockSchema['blockType']; label: string }> = [
  { value: 'data-table', label: 'Data Table' },
  { value: 'card-list', label: 'Card List' },
  { value: 'detail', label: 'Detail View' },
  { value: 'summary', label: 'Summary Stats' },
  { value: 'text', label: 'Text / HTML' },
  { value: 'chart', label: 'Chart' },
];

export default function BlockEditor({ block, onUpdate, onClose }: BlockEditorProps) {
  const updateConfig = (key: string, value: any) => {
    onUpdate({ config: { ...block.config, [key]: value } });
  };

  return (
    <div className="block-editor">
      <div className="block-editor__header">
        <span className="block-editor__header-title">Block Settings</span>
        <button className="interface-btn interface-btn--ghost" onClick={onClose}>
          x
        </button>
      </div>

      <div className="block-editor__body">
        {/* Common fields */}
        <div className="block-editor__field">
          <label className="block-editor__label">Block Title</label>
          <input
            className="block-editor__input"
            value={block.title || ''}
            onChange={e => onUpdate({ title: e.target.value })}
          />
        </div>

        <div className="block-editor__field">
          <label className="block-editor__label">Block Type</label>
          <select
            className="block-editor__select"
            value={block.blockType}
            onChange={e =>
              onUpdate({ blockType: e.target.value as BlockSchema['blockType'] })
            }
          >
            {BLOCK_TYPE_OPTIONS.map(bt => (
              <option key={bt.value} value={bt.value}>
                {bt.label}
              </option>
            ))}
          </select>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '16px 0' }} />

        {/* Type-specific configuration */}
        {block.blockType === 'data-table' && (
          <DataTableConfig config={block.config} onChange={updateConfig} />
        )}
        {block.blockType === 'card-list' && (
          <CardListConfig config={block.config} onChange={updateConfig} />
        )}
        {block.blockType === 'detail' && (
          <DetailConfig config={block.config} onChange={updateConfig} />
        )}
        {block.blockType === 'summary' && (
          <SummaryConfig config={block.config} onChange={updateConfig} />
        )}
        {block.blockType === 'text' && (
          <TextConfig config={block.config} onChange={updateConfig} />
        )}
        {block.blockType === 'chart' && (
          <ChartConfig config={block.config} onChange={updateConfig} />
        )}
      </div>
    </div>
  );
}

/* ---- Type-specific config sub-components ---- */

function DataTableConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <>
      <div className="block-editor__field">
        <label className="block-editor__label">Table ID</label>
        <input
          className="block-editor__input"
          value={config.tableId || ''}
          onChange={e => onChange('tableId', e.target.value)}
          placeholder="e.g. tblXYZ123"
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">Page Size</label>
        <input
          className="block-editor__input"
          type="number"
          min={1}
          max={100}
          value={config.pageSize || 25}
          onChange={e => onChange('pageSize', parseInt(e.target.value) || 25)}
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">
          Columns (JSON array of fieldName, fieldType)
        </label>
        <textarea
          className="block-editor__input"
          style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: 11 }}
          value={JSON.stringify(config.columns || [], null, 2)}
          onChange={e => {
            try {
              onChange('columns', JSON.parse(e.target.value));
            } catch { /* ignore parse errors while typing */ }
          }}
        />
      </div>
    </>
  );
}

function CardListConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <>
      <div className="block-editor__field">
        <label className="block-editor__label">Table ID</label>
        <input
          className="block-editor__input"
          value={config.tableId || ''}
          onChange={e => onChange('tableId', e.target.value)}
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">Title Field</label>
        <input
          className="block-editor__input"
          value={config.titleField || ''}
          onChange={e => onChange('titleField', e.target.value)}
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">Image Field (optional)</label>
        <input
          className="block-editor__input"
          value={config.imageField || ''}
          onChange={e => onChange('imageField', e.target.value)}
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">
          Display Fields (JSON array of fieldName, fieldType)
        </label>
        <textarea
          className="block-editor__input"
          style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: 11 }}
          value={JSON.stringify(config.displayFields || [], null, 2)}
          onChange={e => {
            try {
              onChange('displayFields', JSON.parse(e.target.value));
            } catch { /* ignore */ }
          }}
        />
      </div>
    </>
  );
}

function DetailConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <>
      <div className="block-editor__field">
        <label className="block-editor__label">
          Sections (JSON array of title + fields)
        </label>
        <textarea
          className="block-editor__input"
          style={{ minHeight: 100, fontFamily: 'var(--font-mono)', fontSize: 11 }}
          value={JSON.stringify(config.sections || [], null, 2)}
          onChange={e => {
            try {
              onChange('sections', JSON.parse(e.target.value));
            } catch { /* ignore */ }
          }}
        />
      </div>
    </>
  );
}

function SummaryConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <>
      <div className="block-editor__field">
        <label className="block-editor__label">
          Metrics (JSON array of label, fieldName, aggregation)
        </label>
        <textarea
          className="block-editor__input"
          style={{ minHeight: 100, fontFamily: 'var(--font-mono)', fontSize: 11 }}
          value={JSON.stringify(config.metrics || [], null, 2)}
          onChange={e => {
            try {
              onChange('metrics', JSON.parse(e.target.value));
            } catch { /* ignore */ }
          }}
        />
      </div>
    </>
  );
}

function TextConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <div className="block-editor__field">
      <label className="block-editor__label">HTML Content</label>
      <textarea
        className="block-editor__input"
        style={{ minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 11 }}
        value={config.html || ''}
        onChange={e => onChange('html', e.target.value)}
        placeholder="<p>Your content here...</p>"
      />
    </div>
  );
}

function ChartConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <>
      <div className="block-editor__field">
        <label className="block-editor__label">Chart Type</label>
        <select
          className="block-editor__select"
          value={config.chartType || 'bar'}
          onChange={e => onChange('chartType', e.target.value)}
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
          <option value="donut">Donut</option>
        </select>
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">Table ID</label>
        <input
          className="block-editor__input"
          value={config.tableId || ''}
          onChange={e => onChange('tableId', e.target.value)}
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">Group By Field</label>
        <input
          className="block-editor__input"
          value={config.groupByField || ''}
          onChange={e => onChange('groupByField', e.target.value)}
        />
      </div>
      <div className="block-editor__field">
        <label className="block-editor__label">Value Field</label>
        <input
          className="block-editor__input"
          value={config.valueField || ''}
          onChange={e => onChange('valueField', e.target.value)}
        />
      </div>
    </>
  );
}
