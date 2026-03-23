# Amino — Database UX & Interface Development Report

**Date:** 2026-03-23
**Scope:** Full codebase analysis across 57 commits, 27 PRs, and 3 weeks of development
**Build status:** FAILING — 35 TypeScript errors block deployment

---

## Executive Summary

Amino is a React/TypeScript data management application (v0.1.0) for law firm immigration case management, built on Airtable's data infrastructure with Matrix (Element/Synapse) for real-time collaboration and encrypted messaging. The database UX spans a complex multi-layer architecture: Airtable API → n8n webhooks → Matrix sync → IndexedDB local cache → React Context → Grid UI.

Over 27 PRs, **29 of 57 commits (51%) are bug fixes**, revealing systemic issues in data normalization, state management, and the interface layer. The project has **zero test coverage** and a **broken production build** with 35 TypeScript errors.

---

## Part 1: Architecture Overview

### Data Storage Layers

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Remote API | n8n webhooks (`n8n.intelechia.com`) | Primary data source, Airtable proxy |
| Real-time sync | Matrix room events + polling | Collaboration and change propagation |
| Local cache | IndexedDB with AES-GCM-256 encryption | Offline-capable persistence |
| In-memory state | React Context (Data, Schema, View) | Active session state management |
| Presentation | React grid + interface blocks | User-facing data interaction |

### API Endpoints

- `/amino-tables` — Table metadata
- `/amino-records?tableId=X` — Full table data dump
- `/amino-records-since?tableId=X&since=T` — Incremental sync
- `/amino-fields?tableId=X` — Field schema definitions
- `/amino-events-set?set=X` — Event log for audit/history

All endpoints require Matrix access token (query param or Authorization header).

### Data Normalization Flow

```
API Response (field IDs as keys, e.g. fldABC123)
    ↓
DataContext.parseRawRecords() — Separates field_definition records
    ↓
IndexedDB (cached, encrypted at rest)
    ↓
DataGrid.normalizeFieldKeys() — Maps field ID keys to field names
    ↓
UI Rendering — Components use field.fieldName for lookups
```

**Critical architectural issue:** Normalization happens at the grid layer, not at data ingestion. Other consumers (sidebar, interface blocks, schema designer) don't benefit from it.

---

## Part 2: Database UX Components

### 2.1 Grid System (`src/components/grid/`)

The grid is the primary database interface — an Airtable-style spreadsheet view.

**Core Components:**

| Component | Lines | Responsibility |
|-----------|-------|---------------|
| `DataGrid.tsx` | 700+ | Master grid: virtual scrolling, inline editing, search, filters, sorts, grouping |
| `GridHeader.tsx` | — | Column headers with drag-to-reorder |
| `GridRow.tsx` | — | Virtualized row rendering |
| `GridCell.tsx` | — | Cell type router |

**Cell Type Implementations:**
- `TextCell.tsx` — Single/multiline text
- `NumberCell.tsx` — Number formatting
- `DateCell.tsx` — Date picker
- `SelectCell.tsx` — Dropdown selection
- `CheckboxCell.tsx` — Boolean toggle
- `LinkCell.tsx` — Record linking
- `FormulaCell.tsx` — Computed field display + inline editing
- `LinkedRecordModal.tsx` — Related record inspection

**Grid Toolbar** (`src/components/grid/toolbar/`):
- `FilterBuilder.tsx` — 23 filter operators (equals, contains, is_empty, gt/lt/gte/lte, date ranges, array logic)
- `SortConfig.tsx` — Multi-column sorting
- `GroupConfig.tsx` — Row grouping by field
- `FieldsPanel.tsx` — Show/hide columns
- `ViewSwitcher.tsx` — Save/load named views

**Grid Editing** (`src/components/grid/editing/`):
- `InlineEditor.tsx` — Click-to-edit any cell
- `ExpandedRow.tsx` — Full record modal editor
- `RecordCreator.tsx` — New record form

**Key technologies:** `@tanstack/react-virtual` for virtualized scrolling, `@dnd-kit` for drag-and-drop column reordering/resizing.

### 2.2 Sidebar (`src/components/layout/Sidebar.tsx`)

- Table list with search
- Record count display (loaded count or API metadata fallback)
- Last sync timestamp ("X minutes ago")
- User profile and logout

### 2.3 Schema Management (`src/components/schema/`)

- `SchemaDesigner.tsx` — Field type inspection and editing
- `TableManager.tsx` — Table create/rename/delete
- `FieldEditor.tsx` — Field property editor

### 2.4 Interface Blocks (`src/components/interface/blocks/`)

Pre-built interface components for custom views:

- `DataTableBlock.tsx` — Displays table data in custom interfaces
- `DetailBlock.tsx` — Single record detail view
- `CardListBlock.tsx` — Card grid layout
- `SummaryBlock.tsx` — Aggregate statistics

### 2.5 History & Operations (`src/components/history/`)

- `EoNotationHistory.tsx` — Event operation log with reverse-chronological feed
- Shows local mutations + DB events merged
- Click to expand and see payloads
- Operation types: INS (insert), ALT (alter), NUL (delete), SYNC, INFO

---

## Part 3: State Management — The Three Contexts

### 3.1 DataContext (`src/state/DataContext.tsx` — 367 lines)

**Purpose:** Record data loading, caching, CRUD operations

**Key methods:**
- `loadRecords(tableId)` — Loads from IDB cache first, then API (background refresh)
- `getRecords(tableId)` → AminoRecord[]
- `getFieldDefinitions(tableId)` → FieldDefinitionRecord[]
- `updateRecord()`, `addRecord()`, `deleteRecord()` — In-memory CRUD

**Cache strategy:** Try IDB (instant, may be stale) → Fetch API in background → Update IDB → If API fails but IDB had data, silently use cache.

### 3.2 SchemaContext (`src/state/SchemaContext.tsx` — 458 lines)

**Purpose:** Table metadata, field definitions, type inference

**Key features:**
- Dual field derivation: API endpoint + fallback record scanning
- Type inference using regex heuristics (e.g. `/^rec[A-Za-z0-9]{10,}$/` for linked records)
- Table deduplication by normalized name (trim, collapse whitespace, lowercase)

### 3.3 ViewContext (`src/state/ViewContext.tsx` — 208 lines)

**Purpose:** Grid view configuration per table

**State managed:** Sorts, filters, group-by, hidden fields, field order, field widths, search query.

**Critical gap: ViewContext is NOT persisted.** All grid customizations (column widths, sorts, filters) are lost on page reload. Users must re-configure their view every session.

---

## Part 4: Formula Engine

### Overview

A full formula engine lives in `src/services/formulas/` (1,644 lines across 7 modules):

| Module | Lines | Purpose |
|--------|-------|---------|
| `parser.ts` | 318 | Tokenizer + recursive descent parser |
| `compiler.ts` | 388 | AST → JavaScript with 70+ built-in functions |
| `registry.ts` | 351 | Dependency graph + topological sort |
| `eo-ir.ts` | 291 | Epistemic-Ontological IR (unused) |
| `relational-compiler.ts` | 105 | Cross-table lookups & rollups |
| `types.ts` | 181 | Type definitions |

### Development Timeline

| Date | PR | Attempt | Outcome |
|------|-----|---------|---------|
| Mar 4 | #1 | Built full engine from scratch | Engine built but not wired to UI |
| Mar 5 | #6 | Created `useFormulas` React hook | Hook existed but grid didn't call it |
| Mar 7 | #8 | Added FormulaCell with click-to-view | Users could see defs, values not computed |
| Mar 17 | #15 | Wired `computeRecord()` into grid | Formulas evaluate for same-table fields |

### Current Issues

1. **Lookups/rollups return empty** — `DataContext.tables` map is empty for non-active tables
2. **Build broken** — 2 TypeScript errors in `useFormulas.ts`
3. **No test coverage** — Zero tests across 1,644 lines of formula logic
4. **EO-IR unused** — 291 lines of dead code
5. **Re-computation on every render** — `computeRecord()` creates new function refs each render

---

## Part 5: Issues & Bug History

### Issue 1: Field ID vs Field Name Mismatch
**PRs:** #23, #25 | **Risk: Medium**

The API returns `{fldABC123: value}`, the UI expects `{fieldName: value}`. This caused entire records to render as empty rows.

**Fixed in:** `DataGrid.tsx` via `normalizeFieldKeys()`, but normalization happens in the grid layer only and runs twice per render. Other consumers don't benefit.

**Root cause:** No single normalization layer between the API and the app.

### Issue 2: Duplicate Tables in Sidebar
**PRs:** #9, #15 | **Risk: Low**

Tables appeared multiple times due to casing/whitespace differences.

**Fixed in:** `SchemaContext.tsx` with `deduplicateTables()`. Dedup only runs in SchemaContext — other table fetches could reintroduce duplicates.

### Issue 3: Record Count Mismatch
**PRs:** #9, #11, #21 | **Risk: Medium**

Sidebar showed API metadata counts (including `field_definition` rows), while the grid showed actual data records.

**Partially fixed:** Sidebar uses loaded array length, but falls back to `t.fieldCount` which reintroduces the confusion. `updateRecordCount()` exists but is never called.

### Issue 4: Grid and Column Layout Breakage
**PRs:** #16, #18, #24 | **Risk: Medium-High**

Three separate layout issues across three PRs: missing width constraints, missing grid lines, and column drag interactions.

**Current state:** Alignment is fixed but fragile:
- Virtualizer doesn't account for column width changes during scroll
- Column widths **not persisted** — lost on reload
- No min-width enforcement during drag
- Resize handles interact with drag state unpredictably

### Issue 5: Emitted Operations (EO) Loading
**PRs:** #17, #19 | **Risk: Medium-High**

Events not loading, raw payload toggle breaking, incomplete capture.

**Structural issues remaining:**
- Module-level `_nextId` counter never resets across sessions
- Hard-coded `MAX_LOCAL_OPS = 2000` with silent truncation
- No event deduplication (local edit + Matrix sync = two entries)
- Loads 90 days of history on mount (no incremental sync)

### Issue 6: Schema Designer Showing 0 Fields
**PR:** #11 | **Risk: Low-Medium**

Fixed with `deriveFieldsFromRecords()` fallback, but dual derivation paths (SchemaContext vs DataGrid) can disagree on field types. Type inference uses sampling bias (first non-null value only).

### Issue 7: Webhook/API Data Flow Fragility
**PRs:** #2, #4, #6, #7 | **Risk: High** (most fragile area)

- Dual-auth retry is overbroad (retries ANY network error)
- Hard-coded webhook URL with no env variable
- No response validation after JSON.parse
- Over-flexible event extraction masks real API errors
- Silent data loss: failed `JSON.parse()` returns `{}` — record loses all data
- No pagination or rate limiting

---

## Part 6: Build & Deployment Status

### Build: FAILING — 35 TypeScript Errors

| File | Errors | Primary Issue |
|------|--------|---------------|
| `SchemaContext.tsx` | 5 | Implicit `any` types, missing `react/jsx-runtime` |
| `ViewContext.tsx` | 28 | Cannot find module `react`, 26× implicit `any` |
| `useFormulas.ts` | 2 | Cannot find module `react`, implicit `any` |

**Root cause:** Missing or misconfigured `@types/react` declarations with `strict: true` in tsconfig.json.

**Impact:** CI/CD (`deploy.yml`) runs `npm run build` before deployment — **all deployments are blocked**.

### Test Coverage: Zero

No test files, no test framework, no test scripts in `package.json`. The 51% bug-fix commit rate strongly indicates automated testing would prevent regressions.

---

## Part 7: Development Timeline & PR History

| PR | Date | Title | Type |
|----|------|-------|------|
| #1 | Mar 4 | Build Amino: Matrix-authenticated Postgres data app | Feature |
| #2 | Mar 4 | Fix deployment: add GitHub Pages workflow, HashRouter, base path | Fix |
| #3 | Mar 5 | Wire up missing n8n webhook endpoints | Fix |
| #4 | Mar 5 | Fix webhook hydration: pass Matrix access token | Fix |
| #5 | Mar 5 | Clarify webhook base URL for GitHub Pages | Fix |
| #6 | Mar 5 | Fix TypeScript build error: missing 'items' property | Fix |
| #7 | Mar 6 | Fix events JSON response: normalize payloads | Fix |
| #8 | Mar 7 | Show all fields, formula click-to-view, interface pages | Feature |
| #9 | Mar 7 | Fix interface panel stacking and tables list cutoff | Fix |
| #10 | Mar 8 | Add last synced timestamp display | Feature |
| #11 | Mar 8 | Fix Schema Designer showing 0 fields | Fix |
| #12 | Mar 10 | Fix table loading | Fix |
| #13 | Mar 10 | Add EO Notation History view | Feature |
| #14 | Mar 12 | Add back button to InterfaceNav | Fix |
| #15 | Mar 17 | Fix duplicate tables, wire formula engine | Fix/Feature |
| #16 | Mar 17 | Fix grid column misalignment | Fix |
| #17 | Mar 18 | Fix EO history loading | Fix |
| #18 | Mar 18 | Add Airtable-style adjustable columns | Feature |
| #19 | Mar 18 | Fix raw payload toggle on EO page | Fix |
| #20 | Mar 19 | Add linked record modal, wire interface blocks | Feature |
| #21 | Mar 19 | Fix sidebar record count mismatch | Fix |
| #22 | Mar 20 | Wire local DB caching with encryption | Feature |
| #23 | Mar 20 | Add inline field editing, fix missing record data | Feature/Fix |
| #24 | Mar 21 | Render all column and row lines | Fix |
| #25 | Mar 21 | Fix empty records: normalize field ID keys to names | Fix |
| #26 | Mar 22 | Write persistent issues report | Documentation |
| #27 | Mar 22 | Document formula field attempts | Documentation |

### PR Category Breakdown

| Category | Count | Percentage |
|----------|-------|------------|
| Bug Fix | 15 | 56% |
| Feature | 8 | 30% |
| Feature + Fix | 2 | 7% |
| Documentation | 2 | 7% |

---

## Part 8: Cross-Cutting Patterns

| Pattern | Description | Affected Areas |
|---------|-------------|----------------|
| **Silent failures** | Errors return empty results instead of throwing | API client, DataContext, EO events |
| **Wrong-layer normalization** | Data transforms in UI components, not at ingestion | Field keys, field types, table dedup |
| **No shared validation** | API responses parsed ad-hoc with no schema contracts | Webhooks, events, records, fields |
| **Fallback chains mask bugs** | When source A fails, source B tried without logging | Auth retry, field derivation, event extraction |
| **State divergence** | Same data derived independently in multiple contexts | SchemaContext vs DataGrid field inference |
| **No persistence of UX state** | View configuration lost on every page reload | Column widths, sorts, filters, field order |

---

## Part 9: Metrics Summary

| Metric | Value |
|--------|-------|
| Total Source Files | 70+ TypeScript/TSX |
| State/Context Code | ~4,800 lines |
| Formula Engine | 1,644 lines |
| API & Storage | 800+ lines |
| Grid Components | 1,500+ lines |
| Total Commits | 57 |
| Bug-Fix Commits | 29 (51%) |
| Pull Requests | 27 |
| Test Files | 0 |
| Build Status | FAILING (35 errors) |
| Deployable | No |

---

## Part 10: Recommendations

### Critical (Blocking)

1. **Fix the 35 TypeScript build errors** — Resolve `@types/react` configuration to unblock deployment
2. **Centralize field key normalization** — Move ID→name mapping to DataContext or the API client layer so all consumers benefit

### High Priority

3. **Add API response validation** — Use Zod or similar to validate webhook response schemas at parse time
4. **Replace silent failures** — Log and surface unexpected data shapes instead of returning empty objects
5. **Persist ViewContext to IndexedDB** — Store grid configuration (sorts, filters, column widths) so users don't lose customizations on reload
6. **Add cross-table data hydration** — Populate `DataContext.tables` for formula lookups and rollups to work

### Medium Priority

7. **Add basic test coverage** — Start with field key normalization, table dedup, record counting, API parsing, and formula evaluation
8. **Implement error boundaries** — Catch rendering failures from bad data before they blank the UI
9. **Externalize configuration** — Move `WEBHOOK_BASE` and `MAX_LOCAL_OPS` to environment variables
10. **Fix formula re-computation** — Memoize `computeRecord()` properly so it doesn't re-run on every render cycle

### Low Priority

11. **Add incremental EO event sync** — Don't load full 90-day history on mount
12. **Add pagination** — Limit API requests for large tables
13. **Remove dead code** — Delete the 291-line EO-IR module or wire it into the UI
14. **Unify type inference** — Single derivation path for field types instead of dual SchemaContext/DataGrid inference

---

## Conclusion

Amino has built a sophisticated database UX in three weeks — a full Airtable-style grid with virtual scrolling, inline editing, drag-and-drop columns, a formula engine with 70+ functions, encrypted local caching, and real-time Matrix sync. The ambition of the architecture is clear.

However, the 51% bug-fix rate across commits reveals that the pace of feature development has outrun the infrastructure's ability to support it. The three most impactful issues — field key normalization happening at the wrong layer, view state not being persisted, and a broken production build — are all architectural gaps that compound into recurring UX bugs. Each fix addresses a symptom while the root causes (no centralized data normalization, no persistence layer for UX state, no automated testing) remain.

The path forward is clear: fix the build, centralize data normalization, persist view configuration, and add basic test coverage. These four changes would address the majority of recurring issues and establish a stable foundation for the remaining feature work.
