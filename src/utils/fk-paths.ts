/**
 * FK Path BFS — Finds paths from a starting table to related tables via link fields.
 * Ported from profile-layout-builder.html (lines 448-499).
 */

import type { FieldDef } from './field-types';

/* ------------------------------------------------------------------ */
/*  Types for the original fieldsByTable-based API                     */
/* ------------------------------------------------------------------ */

export interface FKPath {
  /** Full path string, e.g. "Clients.CaseLink > Cases.AttorneyLink > Attorneys" */
  path: string;
  /** Ordered segments */
  segments: FKPathSegment[];
  /** The target table at the end of the path */
  targetTableId: string;
  targetTableName: string;
}

export interface FKPathSegment {
  tableId: string;
  tableName: string;
  linkFieldId: string;
  linkFieldName: string;
}

export interface ReachableField {
  field: FieldDef;
  path: FKPath;
  /** Display label: "TableName > FieldName" */
  label: string;
}

/**
 * BFS to find all tables reachable from a starting table via link fields.
 * Returns paths up to a given depth.
 */
export function findFKPaths(
  startTableId: string,
  fieldsByTable: Record<string, FieldDef[]>,
  tableNames: Record<string, string>,
  maxDepth = 3
): FKPath[] {
  const paths: FKPath[] = [];
  const visited = new Set<string>();

  interface QueueEntry {
    tableId: string;
    segments: FKPathSegment[];
    depth: number;
  }

  const queue: QueueEntry[] = [{ tableId: startTableId, segments: [], depth: 0 }];
  visited.add(startTableId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const fields = fieldsByTable[current.tableId] || [];
    const linkFields = fields.filter(f => f.fieldType === 'multipleRecordLinks');

    for (const linkField of linkFields) {
      // The linked table ID is typically in the field options
      const linkedTableId = linkField.options?.linkedTableId
        || linkField.options?.foreignTableId
        || linkField.options?.recordLinkFieldId;

      if (!linkedTableId || visited.has(linkedTableId)) continue;
      visited.add(linkedTableId);

      const segment: FKPathSegment = {
        tableId: current.tableId,
        tableName: tableNames[current.tableId] || current.tableId,
        linkFieldId: linkField.fieldId,
        linkFieldName: linkField.fieldName,
      };

      const segments = [...current.segments, segment];
      const pathStr = segments
        .map(s => `${s.tableName}.${s.linkFieldName}`)
        .join(' > ') + ` > ${tableNames[linkedTableId] || linkedTableId}`;

      const fkPath: FKPath = {
        path: pathStr,
        segments,
        targetTableId: linkedTableId,
        targetTableName: tableNames[linkedTableId] || linkedTableId,
      };

      paths.push(fkPath);
      queue.push({ tableId: linkedTableId, segments, depth: current.depth + 1 });
    }
  }

  return paths;
}

/**
 * Get all fields reachable from a starting table, including fields from
 * linked tables, annotated with their FK path.
 */
export function getReachableFields(
  startTableId: string,
  fieldsByTable: Record<string, FieldDef[]>,
  tableNames: Record<string, string>,
  maxDepth = 2
): ReachableField[] {
  const result: ReachableField[] = [];

  // Direct fields (no path needed)
  const directFields = fieldsByTable[startTableId] || [];
  for (const field of directFields) {
    result.push({
      field,
      path: {
        path: tableNames[startTableId] || startTableId,
        segments: [],
        targetTableId: startTableId,
        targetTableName: tableNames[startTableId] || startTableId,
      },
      label: field.fieldName,
    });
  }

  // Fields via FK paths
  const paths = findFKPaths(startTableId, fieldsByTable, tableNames, maxDepth);
  for (const fkPath of paths) {
    const targetFields = fieldsByTable[fkPath.targetTableId] || [];
    for (const field of targetFields) {
      result.push({
        field,
        path: fkPath,
        label: `${fkPath.targetTableName} > ${field.fieldName}`,
      });
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Profile Builder Schema types — used by the drag-and-drop builder   */
/* ------------------------------------------------------------------ */

/** A field within the profile builder's schema map */
export interface SchemaField {
  id: string;          // composite key like "table_key.field_key"
  name: string;
  type: string;
  fk_target?: string;  // tableKey of the target table (if multipleRecordLinks)
  _key?: string;        // tableKey this field belongs to
}

/** A table within the profile builder's schema map */
export interface SchemaTable {
  label: string;
  color: string;
  icon?: string;
  tableId?: string;
  fields: SchemaField[];
}

/** A single step in a builder FK path */
export interface BuilderFKPathStep {
  from: string;         // tableKey
  field: string;        // fieldId
  fieldName: string;
  to: string;           // tableKey
  reverse?: boolean;    // true if traversed "backwards"
}

export type BuilderFKPath = BuilderFKPathStep[];

/** Schema map: tableKey -> SchemaTable */
export type SchemaMap = Record<string, SchemaTable>;

/* ------------------------------------------------------------------ */
/*  SchemaMap-based helpers                                            */
/* ------------------------------------------------------------------ */

export function getTableKeyFromFieldId(fieldId: string): string {
  return fieldId.split('.')[0];
}

export function getFieldFromSchemaMap(schema: SchemaMap, fieldId: string): SchemaField | null {
  const tKey = getTableKeyFromFieldId(fieldId);
  if (!schema[tKey]) return null;
  return schema[tKey].fields.find(f => f.id === fieldId) || null;
}

/**
 * BFS from sourceKey to targetKey through FK fields on a SchemaMap.
 * Considers both forward links and reverse links.
 */
export function findBuilderFKPaths(
  schema: SchemaMap,
  sourceKey: string,
  targetKey: string,
  maxDepth: number = 3,
): BuilderFKPath[] {
  if (sourceKey === targetKey) return [[]];

  const paths: BuilderFKPath[] = [];
  const queue: Array<[string, BuilderFKPath]> = [[sourceKey, []]];

  while (queue.length > 0) {
    const [current, path] = queue.shift()!;
    if (path.length >= maxDepth) continue;

    const table = schema[current];
    if (!table) continue;

    // Forward: fields on current table that link elsewhere
    for (const field of table.fields) {
      if (!field.fk_target) continue;

      const step: BuilderFKPathStep = {
        from: current,
        field: field.id,
        fieldName: field.name,
        to: field.fk_target,
      };
      const newPath: BuilderFKPath = [...path, step];

      if (field.fk_target === targetKey) {
        paths.push(newPath);
      } else if (!path.some(p => p.to === field.fk_target)) {
        queue.push([field.fk_target, newPath]);
      }
    }

    // Reverse: fields on other tables that point to current
    for (const tKey of Object.keys(schema)) {
      if (tKey === current) continue;
      const otherTable = schema[tKey];
      for (const f of otherTable.fields) {
        if (f.fk_target !== current) continue;

        const revStep: BuilderFKPathStep = {
          from: tKey,
          field: f.id,
          fieldName: f.name,
          to: current,
          reverse: true,
        };
        const revPath: BuilderFKPath = [...path, revStep];

        if (tKey === targetKey) {
          paths.push(revPath);
        }
      }
    }
  }

  // Deduplicate
  const unique = new Map<string, BuilderFKPath>();
  for (const p of paths) {
    const key = JSON.stringify(p);
    if (!unique.has(key)) unique.set(key, p);
  }

  return Array.from(unique.values());
}

/** Info about a table reachable from the root via FK links */
export interface ReachableTable {
  tableKey: string;
  table: SchemaTable;
  path: BuilderFKPath;
}

/**
 * BFS from rootKey through FK fields, returning all reachable tables
 * along with the shortest path to get there.
 */
export function discoverReachableTables(
  schema: SchemaMap,
  rootKey: string,
  maxDepth: number = 3,
): ReachableTable[] {
  const result: ReachableTable[] = [];
  const visited = new Set<string>([rootKey]);
  const queue: Array<[string, BuilderFKPath]> = [[rootKey, []]];

  // Always include the root table itself
  if (schema[rootKey]) {
    result.push({ tableKey: rootKey, table: schema[rootKey], path: [] });
  }

  while (queue.length > 0) {
    const [current, path] = queue.shift()!;
    if (path.length >= maxDepth) continue;

    const table = schema[current];
    if (!table) continue;

    // Forward links
    for (const field of table.fields) {
      if (!field.fk_target || visited.has(field.fk_target)) continue;
      if (!schema[field.fk_target]) continue;

      visited.add(field.fk_target);
      const step: BuilderFKPathStep = {
        from: current,
        field: field.id,
        fieldName: field.name,
        to: field.fk_target,
      };
      const newPath: BuilderFKPath = [...path, step];
      result.push({ tableKey: field.fk_target, table: schema[field.fk_target], path: newPath });
      queue.push([field.fk_target, newPath]);
    }

    // Reverse links
    for (const tKey of Object.keys(schema)) {
      if (tKey === current || visited.has(tKey)) continue;
      const otherTable = schema[tKey];
      for (const f of otherTable.fields) {
        if (f.fk_target !== current) continue;

        visited.add(tKey);
        const revStep: BuilderFKPathStep = {
          from: tKey,
          field: f.id,
          fieldName: f.name,
          to: current,
          reverse: true,
        };
        const newPath: BuilderFKPath = [...path, revStep];
        result.push({ tableKey: tKey, table: otherTable, path: newPath });
        queue.push([tKey, newPath]);
        break; // only need one reverse link per table
      }
    }
  }

  return result;
}

/**
 * Format a builder FK path as a display string.
 */
export function formatBuilderFKPath(schema: SchemaMap, path: BuilderFKPath): string {
  if (path.length === 0) return '(direct)';
  return path
    .map(step => {
      const fromLabel = schema[step.from]?.label || step.from;
      return `${fromLabel}.${step.fieldName}`;
    })
    .join(' > ')
    + ` > ${schema[path[path.length - 1].to]?.label || path[path.length - 1].to}`;
}
