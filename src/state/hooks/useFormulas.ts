import { useMemo } from 'react';
import { useSchema } from '../SchemaContext';
import { FormulaRegistry } from '../../services/formulas/registry';
import type { FieldRegistryEntry, DataContext as FormulaDataContext } from '../../services/formulas/types';

/**
 * Hook that creates and manages a FormulaRegistry instance for a given table.
 * Compiles all computed fields (formula, lookup, rollup) and provides
 * a function to compute formula values for a record.
 */
export function useFormulas(tableId: string | null) {
  const schema = useSchema();

  const registry = useMemo(() => {
    if (!tableId) return null;

    const fields = schema.getFields(tableId);
    if (fields.length === 0) return null;

    // Convert FieldDef[] to FieldRegistryEntry[]
    const entries: FieldRegistryEntry[] = fields.map(f => ({
      fieldId: f.fieldId,
      fieldName: f.fieldName,
      fieldType: f.fieldType,
      isComputed: ['formula', 'rollup', 'lookup', 'count', 'autoNumber',
        'createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy'
      ].includes(f.fieldType),
      tableId,
      options: f.options,
    }));

    // Minimal data context — FormulaRegistry needs this for relational lookups
    const dataCtx: FormulaDataContext = {
      tables: new Map(),
      fieldRegistry: new Map(entries.map(e => [e.fieldId, e])),
      tableRegistry: new Map(),
    };

    const reg = new FormulaRegistry(entries, dataCtx, tableId, 'amino');

    try {
      reg.compile();
    } catch (err) {
      console.warn('[useFormulas] Compilation error:', err);
    }

    return reg;
  }, [tableId, schema]);

  const computeRecord = useMemo(() => {
    if (!registry) return null;
    return (record: Record<string, unknown>, meta?: { recordId?: string }) => {
      return registry.computeRecord(record, meta);
    };
  }, [registry]);

  return { registry, computeRecord };
}
