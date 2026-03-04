import React, { useMemo } from 'react';
import type { BlockSchema } from '../../../state/InterfaceContext';
import '../../../styles/interface.css';

interface SummaryBlockProps {
  block: BlockSchema;
}

/**
 * Block config shape:
 * {
 *   metrics: Array<{
 *     label: string;
 *     fieldName: string;
 *     aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max';
 *   }>;
 *   records: Array<{ recordId: string; fields: Record<string, any> }>;
 * }
 */

function aggregate(
  records: Array<{ fields: Record<string, any> }>,
  fieldName: string,
  agg: string,
): string {
  if (agg === 'count') return String(records.length);

  const values = records
    .map(r => r.fields[fieldName])
    .filter(v => v != null && typeof v === 'number') as number[];

  if (values.length === 0) return '--';

  switch (agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0).toLocaleString();
    case 'avg':
      return (values.reduce((a, b) => a + b, 0) / values.length).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
    case 'min':
      return Math.min(...values).toLocaleString();
    case 'max':
      return Math.max(...values).toLocaleString();
    default:
      return '--';
  }
}

export default function SummaryBlock({ block }: SummaryBlockProps) {
  const config = block.config;
  const metrics: Array<{ label: string; fieldName: string; aggregation: string }> =
    config.metrics || [];
  const records: Array<{ recordId: string; fields: Record<string, any> }> =
    config.records || [];

  const computed = useMemo(
    () =>
      metrics.map(m => ({
        label: m.label,
        value: aggregate(records, m.fieldName, m.aggregation),
      })),
    [metrics, records],
  );

  return (
    <div className="interface-block">
      {block.title && (
        <div className="interface-block__header">
          <span className="interface-block__title">{block.title}</span>
        </div>
      )}
      <div className="interface-block__body">
        {computed.length === 0 ? (
          <div className="interface-empty">
            <div className="interface-empty__message">No metrics configured.</div>
          </div>
        ) : (
          <div className="summary-stats">
            {computed.map((m, idx) => (
              <div className="summary-stat" key={idx}>
                <div className="summary-stat__value">{m.value}</div>
                <div className="summary-stat__label">{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
