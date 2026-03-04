/**
 * Formula Compiler
 *
 * Compiles a FormulaAST into an executable JavaScript function.
 * The compiled function takes a record object and optional metadata,
 * and returns the computed value.
 *
 * Includes a complete runtime library implementing Airtable's built-in
 * functions (math, text, date, logical, array, record).
 */

import type { FormulaAST, RecordMeta, FormulaError } from './types';

// === Internal compiled node function type ===
type CompiledNodeFn = (record: Record<string, unknown>, meta: RecordMeta) => unknown;

// === Runtime Function Library ===

/**
 * Airtable formula runtime functions.
 * Each function matches Airtable's behavior as closely as possible.
 */
export const FORMULA_RUNTIME: Record<string, (...args: unknown[]) => unknown> = {
  // -- Math --
  ABS: (x: unknown) => Math.abs(x as number),
  CEILING: (x: unknown, sig: unknown) => {
    const s = (sig as number) || 1;
    return Math.ceil((x as number) / s) * s;
  },
  FLOOR: (x: unknown, sig: unknown) => {
    const s = (sig as number) || 1;
    return Math.floor((x as number) / s) * s;
  },
  ROUND: (x: unknown, digits: unknown) => {
    const d = (digits as number) || 0;
    const factor = Math.pow(10, d);
    return Math.round((x as number) * factor) / factor;
  },
  INT: (x: unknown) => Math.floor(x as number),
  MAX: (...args: unknown[]) => Math.max(...(args as number[]).flat()),
  MIN: (...args: unknown[]) => Math.min(...(args as number[]).flat()),
  MOD: (x: unknown, y: unknown) => (x as number) % (y as number),
  POWER: (x: unknown, y: unknown) => Math.pow(x as number, y as number),
  SQRT: (x: unknown) => Math.sqrt(x as number),
  LOG: (x: unknown, base: unknown) => base ? Math.log(x as number) / Math.log(base as number) : Math.log(x as number),
  SUM: (...args: unknown[]) => (args as unknown[]).flat().reduce<number>((a, b) => (a || 0) + ((b as number) || 0), 0),
  EVEN: (x: unknown) => Math.ceil((x as number) / 2) * 2,
  ODD: (x: unknown) => {
    const r = Math.ceil(x as number);
    return r % 2 === 0 ? r + 1 : r;
  },
  VALUE: (x: unknown) => parseFloat(x as string),

  // -- Text --
  CONCATENATE: (...args: unknown[]) => (args as unknown[]).flat().map(a => a ?? '').join(''),
  LEN: (s: unknown) => ((s as string) || '').length,
  LOWER: (s: unknown) => ((s as string) || '').toLowerCase(),
  UPPER: (s: unknown) => ((s as string) || '').toUpperCase(),
  TRIM: (s: unknown) => ((s as string) || '').trim(),
  SUBSTITUTE: (s: unknown, old: unknown, rep: unknown, idx: unknown) => {
    if (!s) return '';
    const str = s as string;
    const oldStr = old as string;
    const repStr = rep as string;
    if (idx != null) {
      let count = 0;
      return str.replace(
        new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        (match: string) => {
          count++;
          return count === (idx as number) ? repStr : match;
        }
      );
    }
    return str.split(oldStr).join(repStr);
  },
  REPLACE: (s: unknown, start: unknown, count: unknown, rep: unknown) =>
    (s as string).slice(0, (start as number) - 1) + (rep as string) + (s as string).slice((start as number) - 1 + (count as number)),
  SEARCH: (needle: unknown, haystack: unknown, start: unknown) => {
    const idx = ((haystack as string) || '').toLowerCase().indexOf(
      (needle as string).toLowerCase(),
      ((start as number) || 1) - 1
    );
    return idx === -1 ? 0 : idx + 1;
  },
  FIND: (needle: unknown, haystack: unknown, start: unknown) => {
    const idx = ((haystack as string) || '').indexOf(needle as string, ((start as number) || 1) - 1);
    return idx === -1 ? 0 : idx + 1;
  },
  MID: (s: unknown, start: unknown, count: unknown) => ((s as string) || '').substr((start as number) - 1, count as number),
  LEFT: (s: unknown, count: unknown) => ((s as string) || '').slice(0, count as number),
  RIGHT: (s: unknown, count: unknown) => ((s as string) || '').slice(-(count as number)),
  REPT: (s: unknown, count: unknown) => ((s as string) || '').repeat(count as number),
  T: (x: unknown) => typeof x === 'string' ? x : '',
  ENCODE_URL_COMPONENT: (s: unknown) => encodeURIComponent((s as string) || ''),
  REGEX_MATCH: (text: unknown, pattern: unknown) => {
    const source = (text as string) ?? '';
    const regex = new RegExp((pattern as string) ?? '');
    return regex.test(String(source));
  },
  REGEX_REPLACE: (text: unknown, pattern: unknown, replacement: unknown) => {
    const source = String((text as string) ?? '');
    const regex = new RegExp((pattern as string) ?? '', 'g');
    return source.replace(regex, (replacement as string) ?? '');
  },
  REGEX_EXTRACT: (text: unknown, pattern: unknown) => {
    const source = String((text as string) ?? '');
    const regex = new RegExp((pattern as string) ?? '');
    const match = source.match(regex);
    return match ? match[0] : null;
  },

  // -- Logical --
  IF: (condition: unknown, ifTrue: unknown, ifFalse: unknown) => condition ? ifTrue : ifFalse,
  SWITCH: (expr: unknown, ...cases: unknown[]) => {
    // SWITCH(expr, pattern1, value1, pattern2, value2, ..., default)
    for (let i = 0; i < cases.length - 1; i += 2) {
      if (expr === cases[i]) return cases[i + 1];
    }
    // Last arg is default if odd number of case args
    return cases.length % 2 === 1 ? cases[cases.length - 1] : null;
  },
  AND: (...args: unknown[]) => (args as unknown[]).flat().every(Boolean),
  OR: (...args: unknown[]) => (args as unknown[]).flat().some(Boolean),
  NOT: (x: unknown) => !x,
  ISERROR: (x: unknown) => !!(x && typeof x === 'object' && (x as FormulaError).__error === true),
  BLANK: () => null,
  ERROR: () => { throw new Error('ERROR()'); },
  COUNT: (...args: unknown[]) => (args as unknown[]).flat().filter(x => typeof x === 'number').length,
  COUNTA: (...args: unknown[]) => (args as unknown[]).flat().filter(x => x != null && x !== '').length,
  COUNTALL: (...args: unknown[]) => (args as unknown[]).flat().length,

  // -- Date --
  NOW: () => new Date(),
  TODAY: () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
  YEAR: (d: unknown) => new Date(d as string | number).getFullYear(),
  MONTH: (d: unknown) => new Date(d as string | number).getMonth() + 1,
  DAY: (d: unknown) => new Date(d as string | number).getDate(),
  HOUR: (d: unknown) => new Date(d as string | number).getHours(),
  MINUTE: (d: unknown) => new Date(d as string | number).getMinutes(),
  SECOND: (d: unknown) => new Date(d as string | number).getSeconds(),
  WEEKDAY: (d: unknown, _startDay: unknown) => new Date(d as string | number).getDay(),
  WEEKNUM: (d: unknown) => {
    const date = new Date(d as string | number);
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  },
  DATEADD: (d: unknown, count: unknown, unit: unknown) => {
    const date = new Date(d as string | number);
    const c = count as number;
    switch (((unit as string) || '').toLowerCase()) {
      case 'years': date.setFullYear(date.getFullYear() + c); break;
      case 'months': date.setMonth(date.getMonth() + c); break;
      case 'weeks': date.setDate(date.getDate() + c * 7); break;
      case 'days': date.setDate(date.getDate() + c); break;
      case 'hours': date.setHours(date.getHours() + c); break;
      case 'minutes': date.setMinutes(date.getMinutes() + c); break;
      case 'seconds': date.setSeconds(date.getSeconds() + c); break;
    }
    return date;
  },
  DATETIME_DIFF: (d1: unknown, d2: unknown, unit: unknown) => {
    const a = new Date(d1 as string | number).getTime();
    const b = new Date(d2 as string | number).getTime();
    const diffMs = a - b;
    switch (((unit as string) || '').toLowerCase()) {
      case 'milliseconds': case 'ms': return diffMs;
      case 'seconds': case 's': return Math.floor(diffMs / 1000);
      case 'minutes': case 'mm': return Math.floor(diffMs / 60000);
      case 'hours': case 'h': return Math.floor(diffMs / 3600000);
      case 'days': case 'd': return Math.floor(diffMs / 86400000);
      case 'weeks': case 'w': return Math.floor(diffMs / 604800000);
      case 'months': case 'm': {
        const da = new Date(a), db = new Date(b);
        return (da.getFullYear() - db.getFullYear()) * 12 + (da.getMonth() - db.getMonth());
      }
      case 'years': case 'y':
        return new Date(a).getFullYear() - new Date(b).getFullYear();
      default: return Math.floor(diffMs / 86400000);
    }
  },
  DATETIME_FORMAT: (d: unknown, format: unknown) => {
    const date = new Date(d as string | number);
    if (!format) return date.toISOString();
    // Airtable uses moment.js format tokens — basic subset
    return (format as string)
      .replace('YYYY', String(date.getFullYear()))
      .replace('YY', String(date.getFullYear()).slice(-2))
      .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
      .replace('M', String(date.getMonth() + 1))
      .replace('DD', String(date.getDate()).padStart(2, '0'))
      .replace('D', String(date.getDate()))
      .replace('HH', String(date.getHours()).padStart(2, '0'))
      .replace('mm', String(date.getMinutes()).padStart(2, '0'))
      .replace('ss', String(date.getSeconds()).padStart(2, '0'));
  },
  DATETIME_PARSE: (s: unknown, _format: unknown) => new Date(s as string),
  DATESTR: (d: unknown) => {
    const date = new Date(d as string | number);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  TIMESTR: (d: unknown) => {
    const date = new Date(d as string | number);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  },
  SET_TIMEZONE: (d: unknown, _tz: unknown) => new Date(d as string | number), // Simplified — timezone handling needs Intl API
  IS_BEFORE: (d1: unknown, d2: unknown) => new Date(d1 as string | number) < new Date(d2 as string | number),
  IS_AFTER: (d1: unknown, d2: unknown) => new Date(d1 as string | number) > new Date(d2 as string | number),
  IS_SAME: (d1: unknown, d2: unknown, unit: unknown) => {
    const a = new Date(d1 as string | number), b = new Date(d2 as string | number);
    if (!unit || unit === 'milliseconds') return a.getTime() === b.getTime();
    if (unit === 'day') {
      return a.getFullYear() === b.getFullYear() &&
             a.getMonth() === b.getMonth() &&
             a.getDate() === b.getDate();
    }
    if (unit === 'month') {
      return a.getFullYear() === b.getFullYear() &&
             a.getMonth() === b.getMonth();
    }
    if (unit === 'year') return a.getFullYear() === b.getFullYear();
    return a.getTime() === b.getTime();
  },

  // -- Array --
  ARRAYJOIN: (arr: unknown, sep: unknown) => ((arr as unknown[]) || []).join((sep as string) ?? ', '),
  ARRAYCOMPACT: (arr: unknown) => ((arr as unknown[]) || []).filter(x => x != null && x !== ''),
  ARRAYFLATTEN: (arr: unknown) => ((arr as unknown[]) || []).flat(Infinity),
  ARRAYSLICE: (arr: unknown, start: unknown, end: unknown) => ((arr as unknown[]) || []).slice(start as number, end as number),
  ARRAYUNIQUE: (arr: unknown) => [...new Set((arr as unknown[]) || [])],

  // -- Numeric extras --
  AVERAGE: (...args: unknown[]) => {
    const nums = (args as unknown[]).flat().filter(x => typeof x === 'number') as number[];
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  },
  ROUNDDOWN: (x: unknown, digits: unknown) => {
    const d = (digits as number) || 0;
    const factor = Math.pow(10, d);
    return Math.floor((x as number) * factor) / factor;
  },
  ROUNDUP: (x: unknown, digits: unknown) => {
    const d = (digits as number) || 0;
    const factor = Math.pow(10, d);
    return Math.ceil((x as number) * factor) / factor;
  },
  EXP: (x: unknown) => Math.exp(x as number),

  // -- Text extras --
  EXACT: (a: unknown, b: unknown) => String(a ?? '') === String(b ?? ''),
  TONUMBER: (x: unknown) => {
    const n = parseFloat(x as string);
    return isNaN(n) ? null : n;
  },

  // -- Logical extras --
  XOR: (...args: unknown[]) => {
    const vals = (args as unknown[]).flat().map(Boolean);
    return vals.filter(Boolean).length % 2 === 1;
  },

  // -- Record / special --
  RECORD_ID: () => null,       // Handled specially in compileNode
  CREATED_TIME: () => null,    // Handled specially in compileNode
  LAST_MODIFIED_TIME: () => null, // Handled specially in compileNode
};

// === AST -> JS Compiler ===

/**
 * Compile a FormulaAST node into an executable function.
 */
function compileNode(node: FormulaAST): CompiledNodeFn {
  switch (node.type) {
    case 'field_ref': {
      const name = node.name;
      return (record: Record<string, unknown>, meta: RecordMeta): unknown => {
        // Direct property lookup (most common)
        if (record[name] !== undefined) return record[name];
        // Try field alias map (ID->name or name->ID) passed from _applyFormulaColumns
        if (meta && meta._fieldAliasMap) {
          const alt = meta._fieldAliasMap[name];
          if (alt && record[alt] !== undefined) return record[alt];
        }
        // Fallback: case-insensitive match for field name mismatches
        const lower = name.toLowerCase();
        const keys = Object.keys(record);
        for (let i = 0; i < keys.length; i++) {
          if (keys[i].toLowerCase() === lower) return record[keys[i]];
        }
        return undefined;
      };
    }

    case 'literal':
      return () => node.value;

    case 'unary_op': {
      const operand = compileNode(node.operand);
      if (node.op === '-') return (r, m) => -(operand(r, m) as number);
      throw new Error(`Unknown unary op: ${node.op}`);
    }

    case 'binary_op': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      switch (node.op) {
        case '+':  return (r, m) => ((left(r, m) as number) || 0) + ((right(r, m) as number) || 0);
        case '-':  return (r, m) => ((left(r, m) as number) || 0) - ((right(r, m) as number) || 0);
        case '*':  return (r, m) => ((left(r, m) as number) || 0) * ((right(r, m) as number) || 0);
        case '/':  return (r, m) => {
          const d = right(r, m) as number;
          return d ? ((left(r, m) as number) || 0) / d : null;
        };
        case '%':  return (r, m) => ((left(r, m) as number) || 0) % ((right(r, m) as number) || 1);
        case '&':  return (r, m) => String(left(r, m) ?? '') + String(right(r, m) ?? '');
        case '=':  return (r, m) => left(r, m) == right(r, m);
        case '!=': return (r, m) => left(r, m) != right(r, m);
        case '<':  return (r, m) => (left(r, m) as number) < (right(r, m) as number);
        case '>':  return (r, m) => (left(r, m) as number) > (right(r, m) as number);
        case '<=': return (r, m) => (left(r, m) as number) <= (right(r, m) as number);
        case '>=': return (r, m) => (left(r, m) as number) >= (right(r, m) as number);
        default: throw new Error(`Unknown binary op: ${node.op}`);
      }
    }

    case 'function_call': {
      const args = node.args.map(compileNode);
      const fnName = node.name.toUpperCase();

      // Special-case record meta functions
      if (fnName === 'RECORD_ID') return (_r, m) => m ? m.recordId : null;
      if (fnName === 'CREATED_TIME') return (_r, m) => m && m.createdTime ? new Date(m.createdTime) : null;
      if (fnName === 'LAST_MODIFIED_TIME') return (_r, m) => m && m.lastModifiedTime ? new Date(m.lastModifiedTime) : null;

      if (fnName === 'ISERROR') {
        return (r, m) => {
          try {
            args[0]?.(r, m);
            return false;
          } catch (_e) {
            return true;
          }
        };
      }

      const runtimeFn = FORMULA_RUNTIME[fnName];
      if (!runtimeFn) {
        // Gracefully handle unknown functions: warn once and return null at
        // runtime instead of aborting the entire formula compilation.
        if (typeof console !== 'undefined') {
          console.warn(`Formula engine: unsupported function "${fnName}" — returning null`);
        }
        return () => null;
      }

      return (r, m) => {
        const evaluatedArgs = args.map(a => a(r, m));
        return runtimeFn(...evaluatedArgs);
      };
    }

    default:
      throw new Error(`Cannot compile node type: ${(node as FormulaAST).type}`);
  }
}

/**
 * Compile a FormulaAST into an executable function.
 * The returned function takes a record object and optional record metadata,
 * and returns the computed value. Errors are caught and returned as
 * { __error: true, message: string }.
 */
export function compileFormula(ast: FormulaAST): (record: Record<string, unknown>, meta?: RecordMeta) => unknown {
  const fn = compileNode(ast);
  return (record: Record<string, unknown>, meta?: RecordMeta): unknown => {
    try {
      return fn(record, meta || {});
    } catch (e) {
      return { __error: true, message: (e as Error).message };
    }
  };
}
