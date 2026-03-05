/**
 * Formula Engine Type Definitions
 *
 * TypeScript types for the AST nodes, token types, EO-IR descriptors,
 * and all shared interfaces used across the formula engine.
 */

// === Token Types ===

export type TokenType =
  | 'FIELD_REF'
  | 'STRING'
  | 'NUMBER'
  | 'IDENT'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value?: string | number;
}

// === AST Node Types ===

export interface FieldRefNode {
  type: 'field_ref';
  name: string;
}

export interface LiteralNode {
  type: 'literal';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'null';
}

export interface FunctionCallNode {
  type: 'function_call';
  name: string;
  args: FormulaAST[];
}

export interface BinaryOpNode {
  type: 'binary_op';
  op: string;
  left: FormulaAST;
  right: FormulaAST;
}

export interface UnaryOpNode {
  type: 'unary_op';
  op: string;
  operand: FormulaAST;
}

export type FormulaAST =
  | FieldRefNode
  | LiteralNode
  | FunctionCallNode
  | BinaryOpNode
  | UnaryOpNode;

// === Record Metadata ===

export interface RecordMeta {
  recordId?: string;
  createdTime?: string;
  lastModifiedTime?: string;
  _fieldAliasMap?: Record<string, string>;
}

// === Formula Error ===

export interface FormulaError {
  __error: true;
  message: string;
}

// === Compiled Formula Function ===

export type FormulaFn = (record: Record<string, unknown>, meta?: RecordMeta) => unknown;

// === Result Type ===

export interface ResultType {
  type: string;
  options?: Record<string, unknown>;
}

// === EO-IR Types ===

export type EoOperator = 'DES' | 'SEG' | 'CON' | 'ALT';
export type EpistemicStatus = 'GIVEN' | 'DERIVED';
export type DerivationType = 'formula' | 'rollup' | 'lookup';

export interface EoIROperator {
  op: EoOperator;
  params: Record<string, unknown>;
  inputs: string[];
  output: string;
}

export interface SourceFieldRef {
  fieldId: string;
  fieldName: string;
  tableId: string;
  epistemicStatus: EpistemicStatus;
}

export interface Grounding {
  source: 'airtable_schema';
  baseId: string;
  tableId: string;
  fieldId: string;
  capturedAt: string;
  schemaVersion: string;
  rawDefinition: string;
}

export interface EoIRComputedField {
  fieldId: string;
  fieldName: string;
  setId: string;
  mode: 'DERIVED';
  derivationType: DerivationType;
  operators: EoIROperator[];
  sourceFields: SourceFieldRef[];
  grounding: Grounding;
  resultType: ResultType;
}

// === Translation Context ===

export interface TranslationContext {
  tableId: string;
  fieldRegistry: Map<string, FieldRegistryEntry>;
  baseId: string;
  capturedAt: string;
}

// === Field Registry Entry ===

export interface FieldRegistryEntry {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  isComputed: boolean;
  tableId: string;
  options?: FieldOptions;
}

export interface FieldOptions {
  formula?: string;
  recordLinkFieldId?: string;
  fieldIdInLinkedTable?: string;
  linkedTableId?: string;
  result?: ResultType;
  [key: string]: unknown;
}

// === Data Context (for relational compiler) ===

export interface DataContext {
  tables: Map<string, Map<string, Record<string, unknown>>>;
  fieldRegistry: Map<string, FieldRegistryEntry>;
  tableRegistry: Map<string, unknown>;
}

// === Compiled Field (registry output) ===

export interface CompiledField {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  execute: FormulaFn;
  eoIR: EoIRComputedField | null;
  sourceFieldNames: string[];
  resultType: ResultType;
}
