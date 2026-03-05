// =============================================================================
// EO Operations — Normalize and Apply ALT/INS/NUL Field Mutations
//
// VERBATIM PORT of normalizeFieldOps() and applyFieldOps() from hydration.js
// (lines 293-332). The EO format is the canonical mutation language for Amino
// record fields. These two functions MUST remain compatible with the original
// JavaScript implementation.
//
// Wire formats supported:
//   Structured: { payload: { fields: { ALT: {...}, INS: {...}, NUL: [...] } } }
//   Flat:       { op: 'ALT', fields: { key: val } }
//
// Application order: ALT -> INS -> NUL (always, no exceptions).
// =============================================================================

import type { FieldOps, EOEventContent } from './types';

/**
 * Normalize incoming mutation content to canonical { ALT, INS, NUL } form.
 *
 * Supports two wire formats:
 *   Structured: { payload: { fields: { ALT: {...}, INS: {...}, NUL: [...] } } }
 *   Flat:       { op: 'ALT', fields: { key: val } }
 *
 * @param content - Raw event content from Matrix or API
 * @returns Canonical FieldOps object
 */
export function normalizeFieldOps(content: EOEventContent): FieldOps {
  const payload = content.payload || content;
  let fieldOps: any = (payload as any).fields || {};

  // Detect flat format and convert
  if (
    !fieldOps.ALT &&
    !fieldOps.INS &&
    !fieldOps.NUL &&
    content.op &&
    content.fields
  ) {
    fieldOps = {};
    if (content.op === 'INS' || content.op === 'ALT') {
      fieldOps[content.op] = content.fields;
    } else if (content.op === 'NUL') {
      fieldOps.NUL = content.fields;
    }
  }

  return fieldOps as FieldOps;
}

/**
 * Apply field operations to a fields object (mutates in place).
 *
 * Order: ALT -> INS -> NUL (same semantics as data-layer.js).
 *
 * - ALT: overwrite existing field values
 * - INS: insert new field values
 * - NUL: delete fields (remove keys)
 *
 * @param fields - The record's fields object (mutated in place)
 * @param fieldOps - Canonical field operations to apply
 * @returns The mutated fields object (same reference)
 */
export function applyFieldOps(
  fields: Record<string, any>,
  fieldOps: FieldOps,
): Record<string, any> {
  if (fieldOps.ALT) {
    const altKeys = Object.keys(fieldOps.ALT);
    for (let a = 0; a < altKeys.length; a++) {
      fields[altKeys[a]] = fieldOps.ALT[altKeys[a]];
    }
  }
  if (fieldOps.INS) {
    const insKeys = Object.keys(fieldOps.INS);
    for (let n = 0; n < insKeys.length; n++) {
      fields[insKeys[n]] = fieldOps.INS[insKeys[n]];
    }
  }
  if (fieldOps.NUL) {
    const nulFields = Array.isArray(fieldOps.NUL)
      ? fieldOps.NUL
      : Object.keys(fieldOps.NUL);
    for (let d = 0; d < nulFields.length; d++) {
      delete fields[nulFields[d]];
    }
  }
  return fields;
}
