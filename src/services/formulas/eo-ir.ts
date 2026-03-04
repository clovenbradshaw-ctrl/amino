/**
 * EO-IR (Epistemic-Ontological Intermediate Representation) Translator
 *
 * Translates a FormulaAST into an EO-IR operator chain that captures:
 * - What is being computed (the operation chain)
 * - From what it derives (source GIVEN fields)
 * - How the derivation was defined (Airtable schema as grounding)
 * - When the definition was captured (schema sync timestamp)
 *
 * EO Operators:
 *   DES  — field selection / description (reading a value from a record)
 *   SEG  — segmentation / aggregation (SUM, COUNT, filtering)
 *   CON  — connection traversal (following linked records)
 *   ALT  — transformation (date math, string ops, arithmetic)
 *
 * Epistemic Status:
 *   GIVEN   — user-entered data, directly observed
 *   DERIVED — computed from other fields via formula/rollup/lookup
 */

import { collectFieldRefs } from './parser';
import type {
  FormulaAST,
  EoIROperator,
  EoIRComputedField,
  SourceFieldRef,
  TranslationContext,
  ResultType,
  EpistemicStatus,
} from './types';

// Aggregation function names that map to SEG operator
const AGGREGATION_FUNCTIONS = new Set([
  'SUM', 'COUNT', 'COUNTA', 'COUNTALL', 'MAX', 'MIN', 'AVERAGE'
]);

/**
 * Build an EO-IR operator chain from a FormulaAST.
 * Flattens the tree into a linear sequence of operators.
 */
function buildOperatorChain(ast: FormulaAST, ctx: TranslationContext): EoIROperator[] {
  const ops: EoIROperator[] = [];
  let counter = 0;

  function emit(op: EoIROperator['op'], params: Record<string, unknown>, inputs: string[]): string {
    const output = `_v${counter++}`;
    ops.push({ op, params, inputs, output });
    return output;
  }

  function translate(node: FormulaAST): string {
    switch (node.type) {
      case 'field_ref': {
        const entry = ctx.fieldRegistry.get(node.name);
        const fieldId = entry ? entry.fieldId : `UNRESOLVED:${node.name}`;
        return emit('DES', { field: node.name, fieldId }, [fieldId]);
      }
      case 'literal': {
        return emit('ALT', {
          transform: 'literal',
          value: node.value,
          dataType: node.dataType
        }, []);
      }
      case 'binary_op': {
        const leftRef = translate(node.left);
        const rightRef = translate(node.right);
        return emit('ALT', {
          transform: 'binary_op',
          op: node.op
        }, [leftRef, rightRef]);
      }
      case 'unary_op': {
        const operandRef = translate(node.operand);
        return emit('ALT', {
          transform: 'unary_op',
          op: node.op
        }, [operandRef]);
      }
      case 'function_call': {
        const argRefs = node.args.map(translate);
        if (AGGREGATION_FUNCTIONS.has(node.name)) {
          return emit('SEG', { aggregation: node.name }, argRefs);
        }
        return emit('ALT', {
          transform: 'function_call',
          function: node.name
        }, argRefs);
      }
      default:
        throw new Error(`Unknown AST node type: ${(node as FormulaAST).type}`);
    }
  }

  translate(ast);
  return ops;
}

/**
 * Translate a parsed formula AST into a full EO-IR computed field descriptor.
 */
export function translateToEoIR(
  fieldId: string,
  fieldName: string,
  ast: FormulaAST,
  rawFormula: string,
  resultType: ResultType,
  ctx: TranslationContext
): EoIRComputedField {
  const fieldRefs = collectFieldRefs(ast);

  const sourceFields: SourceFieldRef[] = fieldRefs.map(name => {
    const entry = ctx.fieldRegistry.get(name);
    if (!entry) {
      return {
        fieldId: `UNRESOLVED:${name}`,
        fieldName: name,
        tableId: ctx.tableId,
        epistemicStatus: 'GIVEN' as EpistemicStatus
      };
    }
    return {
      fieldId: entry.fieldId,
      fieldName: entry.fieldName,
      tableId: entry.tableId || ctx.tableId,
      epistemicStatus: (entry.isComputed ? 'DERIVED' : 'GIVEN') as EpistemicStatus
    };
  });

  const operators = buildOperatorChain(ast, ctx);

  return {
    fieldId,
    fieldName,
    setId: ctx.tableId,
    mode: 'DERIVED',
    derivationType: 'formula',
    operators,
    sourceFields,
    grounding: {
      source: 'airtable_schema',
      baseId: ctx.baseId,
      tableId: ctx.tableId,
      fieldId,
      capturedAt: ctx.capturedAt,
      schemaVersion: `field_registry:${ctx.capturedAt}`,
      rawDefinition: rawFormula
    },
    resultType
  };
}

/**
 * Build an EO-IR descriptor for a lookup field.
 */
export function translateLookupToEoIR(
  fieldId: string,
  fieldName: string,
  linkFieldId: string,
  linkFieldName: string,
  foreignFieldId: string,
  foreignFieldName: string,
  linkedTableId: string,
  resultType: ResultType,
  ctx: TranslationContext
): EoIRComputedField {
  const operators: EoIROperator[] = [
    {
      op: 'CON',
      params: {
        traversal: 'linked_record',
        linkField: linkFieldName,
        linkFieldId,
        targetTable: linkedTableId
      },
      inputs: [linkFieldId],
      output: '_linked_records'
    },
    {
      op: 'DES',
      params: {
        field: foreignFieldName,
        fieldId: foreignFieldId,
        sourceTable: linkedTableId
      },
      inputs: ['_linked_records'],
      output: '_lookup_result'
    }
  ];

  return {
    fieldId,
    fieldName,
    setId: ctx.tableId,
    mode: 'DERIVED',
    derivationType: 'lookup',
    operators,
    sourceFields: [{
      fieldId: linkFieldId,
      fieldName: linkFieldName,
      tableId: ctx.tableId,
      epistemicStatus: 'GIVEN'
    }],
    grounding: {
      source: 'airtable_schema',
      baseId: ctx.baseId,
      tableId: ctx.tableId,
      fieldId,
      capturedAt: ctx.capturedAt,
      schemaVersion: `field_registry:${ctx.capturedAt}`,
      rawDefinition: `LOOKUP({${linkFieldName}}, {${foreignFieldName}})`
    },
    resultType
  };
}

/**
 * Build an EO-IR descriptor for a rollup field.
 */
export function translateRollupToEoIR(
  fieldId: string,
  fieldName: string,
  linkFieldId: string,
  linkFieldName: string,
  foreignFieldId: string,
  foreignFieldName: string,
  linkedTableId: string,
  aggregationFormula: string,
  resultType: ResultType,
  ctx: TranslationContext
): EoIRComputedField {
  const aggName = aggregationFormula.replace(/\(values\)/i, '').trim().toUpperCase();

  const operators: EoIROperator[] = [
    {
      op: 'CON',
      params: {
        traversal: 'linked_record',
        linkField: linkFieldName,
        linkFieldId,
        targetTable: linkedTableId
      },
      inputs: [linkFieldId],
      output: '_linked_records'
    },
    {
      op: 'DES',
      params: {
        field: foreignFieldName,
        fieldId: foreignFieldId,
        sourceTable: linkedTableId
      },
      inputs: ['_linked_records'],
      output: '_lookup_values'
    },
    {
      op: 'SEG',
      params: {
        aggregation: aggName,
        formula: aggregationFormula
      },
      inputs: ['_lookup_values'],
      output: '_rollup_result'
    }
  ];

  return {
    fieldId,
    fieldName,
    setId: ctx.tableId,
    mode: 'DERIVED',
    derivationType: 'rollup',
    operators,
    sourceFields: [{
      fieldId: linkFieldId,
      fieldName: linkFieldName,
      tableId: ctx.tableId,
      epistemicStatus: 'GIVEN'
    }],
    grounding: {
      source: 'airtable_schema',
      baseId: ctx.baseId,
      tableId: ctx.tableId,
      fieldId,
      capturedAt: ctx.capturedAt,
      schemaVersion: `field_registry:${ctx.capturedAt}`,
      rawDefinition: `ROLLUP({${linkFieldName}}, {${foreignFieldName}}, ${aggregationFormula})`
    },
    resultType
  };
}
