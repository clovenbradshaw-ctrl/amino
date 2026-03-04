/**
 * Relational Compiler — Lookups and Rollups
 *
 * Lookups and rollups require access to linked records beyond the current row.
 * This module compiles lookup and rollup field definitions into executable
 * functions that resolve linked record references.
 */

import type { DataContext } from './types';

/**
 * Compile a lookup field into an executable function.
 * Resolves linked record IDs and pulls a field from the linked table.
 */
export function compileLookup(
  linkFieldName: string,
  foreignFieldName: string,
  ctx: DataContext,
  linkedTableId: string
): (record: Record<string, unknown>) => unknown[] {
  return (record: Record<string, unknown>): unknown[] => {
    // Get linked record IDs from the link field
    const linkedIds = record[linkFieldName];
    if (!Array.isArray(linkedIds) || linkedIds.length === 0) return [];

    // Resolve each linked record from the target table
    const linkedTable = ctx.tables.get(linkedTableId);
    if (!linkedTable) return [];

    return linkedIds
      .map((id: string) => linkedTable.get(id))
      .filter(Boolean)
      .map((rec) => (rec as Record<string, unknown>)[foreignFieldName]);
  };
}

/**
 * Compile a rollup field into an executable function.
 * Performs a lookup, then applies an aggregation function to the results.
 */
export function compileRollup(
  linkFieldName: string,
  foreignFieldName: string,
  aggregationFormula: string,
  ctx: DataContext,
  linkedTableId: string
): (record: Record<string, unknown>) => unknown {
  const lookupFn = compileLookup(linkFieldName, foreignFieldName, ctx, linkedTableId);

  // Parse the rollup aggregation formula — extract function name
  const aggName = aggregationFormula.replace(/\(values\)/i, '').trim().toUpperCase();

  return (record: Record<string, unknown>): unknown => {
    const values = lookupFn(record);

    switch (aggName) {
      case 'SUM':
        return values.reduce<number>((a, b) => (a || 0) + ((b as number) || 0), 0);

      case 'MAX': {
        const nums = values.filter(v => typeof v === 'number') as number[];
        return nums.length ? Math.max(...nums) : null;
      }

      case 'MIN': {
        const nums = values.filter(v => typeof v === 'number') as number[];
        return nums.length ? Math.min(...nums) : null;
      }

      case 'AVERAGE': {
        const nums = values.filter(v => typeof v === 'number') as number[];
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      }

      case 'COUNT':
        return values.filter(v => typeof v === 'number').length;

      case 'COUNTA':
        return values.filter(v => v != null && v !== '').length;

      case 'COUNTALL':
        return values.length;

      case 'CONCATENATE':
      case 'ARRAYJOIN':
        return values.map(v => v ?? '').join(', ');

      case 'ARRAYUNIQUE':
        return [...new Set(values)];

      case 'ARRAYCOMPACT':
        return values.filter(v => v != null && v !== '');

      case 'AND':
        return values.every(Boolean);

      case 'OR':
        return values.some(Boolean);

      default:
        console.warn(`Unsupported rollup aggregation: ${aggregationFormula}`);
        return null;
    }
  };
}
