/** EO (Epistemic-Ontological) format utilities for the UI layer */

export type EOOperator = 'ALT' | 'INS' | 'NUL';

export interface FieldOps {
  ALT?: Record<string, any>;
  INS?: Record<string, any>;
  NUL?: string[] | Record<string, any>;
}

/** Build a mutation payload for changing field values */
export function buildMutation(
  recordId: string,
  tableId: string,
  changes: Record<string, any>,
  operator: EOOperator = 'ALT'
): { recordId: string; tableId: string; payload: { fields: FieldOps } } {
  const fields: FieldOps = {};
  if (operator === 'NUL') {
    fields.NUL = Object.keys(changes);
  } else {
    fields[operator] = changes;
  }
  return { recordId, tableId, payload: { fields } };
}

/** Build a record creation payload */
export function buildCreatePayload(
  tableId: string,
  fields: Record<string, any>
): { tableId: string; payload: { fields: FieldOps } } {
  return { tableId, payload: { fields: { INS: fields } } };
}

/** Build a delete payload (NUL all fields) */
export function buildDeletePayload(
  recordId: string,
  tableId: string,
  fieldNames: string[]
): { recordId: string; tableId: string; payload: { fields: FieldOps } } {
  return { recordId, tableId, payload: { fields: { NUL: fieldNames } } };
}

/** Get a human-readable description of field operations */
export function describeFieldOps(ops: FieldOps): string {
  const parts: string[] = [];
  if (ops.ALT) {
    const keys = Object.keys(ops.ALT);
    parts.push(`updated ${keys.length} field${keys.length !== 1 ? 's' : ''}`);
  }
  if (ops.INS) {
    const keys = Object.keys(ops.INS);
    parts.push(`added ${keys.length} field${keys.length !== 1 ? 's' : ''}`);
  }
  if (ops.NUL) {
    const count = Array.isArray(ops.NUL) ? ops.NUL.length : Object.keys(ops.NUL).length;
    parts.push(`cleared ${count} field${count !== 1 ? 's' : ''}`);
  }
  return parts.join(', ') || 'no changes';
}
