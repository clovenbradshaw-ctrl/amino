# Formula Fields — What's Been Tried

**Date:** 2026-03-23
**Scope:** Full history of formula field implementation across 4 PRs and 53 commits

---

## Background

Amino is a React/TypeScript data management app for law firm immigration cases, built on top of Airtable. Airtable has several "computed" field types — formula, rollup, lookup, count, autoNumber, createdTime, etc. — whose values are derived from other fields rather than entered by users. The goal was to evaluate these formulas client-side so computed columns display real values in the grid instead of raw formula text.

---

## Attempt 1: Full Formula Engine Built from Scratch (PR #1 — Mar 4)

**Commit:** `66e8557` — *Build Amino: Matrix-authenticated Postgres data app with Airtable grid + Softr-style interface*

The initial build included a complete formula engine in `src/services/formulas/` — 1,644 lines across 7 modules:

| Module | Lines | Purpose |
|--------|-------|---------|
| `parser.ts` | 318 | Tokenizer + recursive descent parser for Airtable formula syntax |
| `compiler.ts` | 388 | AST → JavaScript compiler with 70+ built-in functions |
| `registry.ts` | 351 | Dependency graph, topological sort, orchestration |
| `eo-ir.ts` | 291 | Epistemic-Ontological IR translation layer |
| `relational-compiler.ts` | 105 | Lookup and rollup compilation (cross-table) |
| `types.ts` | 181 | Type definitions for AST, tokens, registry entries |
| `index.ts` | 10 | Public exports |

**What it supports:**
- Tokenizes `{Field Name}` references, string/number literals, operators
- Recursive descent parser with proper operator precedence (comparison → add/sub → mul/div → unary → primary)
- 70+ Airtable functions: math (ABS, ROUND, SUM...), text (CONCATENATE, SUBSTITUTE, REGEX_MATCH...), logical (IF, SWITCH, AND...), date (DATEADD, DATETIME_DIFF...), array (ARRAYJOIN, ARRAYUNIQUE...)
- Dependency graph between computed fields with topological sort
- Lookup fields (traverse linked records to pull values from another table)
- Rollup fields (lookup + aggregation: SUM, COUNT, AVERAGE, etc.)
- EO-IR layer that captures *what* is computed, *from what*, and *how* — a semantic representation for audit/tracing

**What happened:** The engine was built but **not wired into the UI**. It sat unused — the grid showed raw formula text or empty cells for computed fields.

---

## Attempt 2: Wire the useFormulas Hook (PR #6 — Mar 5)

**Commit:** `3aef001` — *Fix critical data flow gaps: auth integration, real data loading, formula hook*

Created `src/state/hooks/useFormulas.ts` (59 lines) to bridge the formula engine into React:

```typescript
useFormulas(tableId: string | null): {
  registry: FormulaRegistry | null
  computeRecord: (record, meta?) => Record<string, unknown>
}
```

The hook takes all fields for a table, converts them to `FieldRegistryEntry` objects, builds a `FormulaRegistry`, compiles it, and returns a `computeRecord()` function.

**What happened:** The hook existed but **DataGrid didn't call it**. The grid was still loading mock data at this point, so even though the formula plumbing was in place, it wasn't connected to actual record rendering.

---

## Attempt 3: FormulaCell UI + Click-to-View (PR #8 — Mar 7)

**Commit:** `897fae0` — *Show all fields, add formula click-to-view, and pre-built interface pages*

Added `src/components/grid/cells/FormulaCell.tsx` (185 lines) with:
- Type-specific icons: `ƒx` for formulas, `Σ` for rollups, `↗?` for lookups, `#N` for counts
- Click-to-view popover showing the formula definition, aggregation function, or linked table info
- Inline editing mode for formula expressions
- Integration into `GridCell.tsx` so computed field types route to `FormulaCell`

**What happened:** Users could now **see** that a field was a formula and inspect its definition, but the formulas still **weren't evaluated**. The cell showed the formula definition as metadata, not the computed result. This was a UI improvement, not an execution improvement.

---

## Attempt 4: Actually Wire Formula Evaluation into the Grid (PR #15 — Mar 17)

**Commit:** `57a3faf` — *Fix duplicate tables, separate field_definition records as schema, wire formula engine*

This was the commit that finally connected everything. Three changes made it work:

1. **Separate field_definition records from data.** `DataContext.parseRawRecords()` now partitions incoming records — rows with `_set="field_definition"` are extracted as schema metadata and exposed via `getFieldDefinitions()`. Previously these were mixed into the data and showed up as regular table rows.

2. **Push field definitions into schema.** `DataGrid` pushes extracted field definitions into `SchemaContext` via `applyFieldDefinitions()`, so the schema knows which fields are formulas, what their expressions are, and what their result types should be.

3. **Compute formulas before rendering.** `DataGrid` now runs `computeRecord()` on every record before display:
   ```typescript
   const { computeRecord } = useFormulas(tableId);
   const records = useMemo(() => {
     return dataRecords.map(r => ({
       ...r,
       fields: computeRecord(r.fields, { recordId: r.recordId })
     }));
   }, [dataRecords, computeRecord]);
   ```

**What happened:** Formula columns finally showed computed values instead of raw text. But several issues remain.

---

## Current State — What Works and What Doesn't

### Works
- Formula parsing and compilation for most Airtable formula syntax
- Basic formula evaluation (arithmetic, string ops, conditionals, date math)
- Dependency ordering — formulas that reference other formulas compute in the right order
- FormulaCell UI — users can inspect formula definitions via click popover
- Field definition extraction from the data stream

### Doesn't Work / Partially Broken

**Lookups and rollups return empty.** The `useFormulas` hook creates an empty `DataContext.tables` map, so the relational compiler has no data to traverse. Lookups and rollups require records from *other* tables to be loaded, but currently only the active table's records are available. This means any field that crosses table boundaries silently returns `undefined`.

**Build is broken.** `useFormulas.ts` has 2 TypeScript errors (missing `react` module declaration, implicit `any`). Combined with 33 other errors in `SchemaContext.tsx` and `ViewContext.tsx`, the production build fails entirely. The formula system can't be deployed.

**No tests.** Zero test coverage across the entire formula engine — no unit tests for parsing, compilation, dependency resolution, or any of the 70+ built-in functions. Given the complexity (1,644 lines of formula logic), this is a significant gap.

**EO-IR layer is unused.** The 291-line epistemic-ontological translation layer (`eo-ir.ts`) generates semantic representations of formulas but nothing in the app consumes them. The FormulaCell popover doesn't display EO-IR data. It's dead code.

**Dual type inference.** Both `SchemaContext` and `DataGrid` independently infer field types from record data. They can disagree — one might see a field as `text` while the other sees `number` — because they sample different records.

**Normalization happens too late.** Formulas reference fields by name (`{Price}`), but the API returns record values keyed by field IDs (`fldABC123`). The ID→name normalization happens in the grid layer, not at ingestion. If the formula engine runs before normalization, field refs don't resolve.

**Re-computation on every render.** `computeRecord()` runs inside a `useMemo` that depends on `computeRecord` itself (a new function reference each render from `useFormulas`). This means formulas re-evaluate on every render cycle, not just when data changes.

---

## Timeline Summary

| Date | PR | What Was Tried | Outcome |
|------|-----|----------------|---------|
| Mar 4 | #1 | Built full formula engine (parser, compiler, registry, EO-IR, relational compiler) | Engine built but not wired to UI |
| Mar 5 | #6 | Created `useFormulas` React hook | Hook existed but grid didn't call it |
| Mar 7 | #8 | Added FormulaCell with click-to-view popover | Users could see formula defs but values weren't computed |
| Mar 17 | #15 | Separated field_definitions from data, wired `computeRecord()` into grid rendering | Formulas evaluate for same-table fields; cross-table lookups/rollups still empty |

---

## Key Lessons

1. **Building the engine wasn't the hard part.** The parser, compiler, and registry were all in the initial commit. The real difficulty was getting data to flow correctly — separating schema from data, normalizing field keys, and hydrating the right tables at the right time.

2. **Each attempt solved one layer but exposed the next.** Hook exists → but grid doesn't call it. Grid calls it → but field definitions aren't in schema. Field definitions flow → but cross-table data isn't loaded.

3. **The relational problem is unsolved.** Lookups and rollups are the most valuable computed fields (they let you see data from related tables), but they require multi-table hydration that the current architecture doesn't support. The `DataContext.tables` map is empty for non-active tables.

4. **Infrastructure debt compounds.** The broken build, zero test coverage, and dual type inference paths all make formula work harder. Each formula bug requires manual testing across the full stack because there's no automated verification.
