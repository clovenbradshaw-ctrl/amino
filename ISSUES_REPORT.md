# Amino — Persistent Issues Report

**Date:** 2026-03-23
**Scope:** Full codebase and git history analysis (53 commits, 25 PRs)
**Build status:** FAILING — 35 TypeScript errors in `SchemaContext.tsx`, `ViewContext.tsx`, `useFormulas.ts`

---

## Executive Summary

Amino is a React/TypeScript data management app (v0.1.0) for law firm immigration cases. Across 25 PRs, **29 of 53 commits are bug fixes**, revealing several systemic issues that have required repeated attention. The project also has **zero test coverage** and a **broken production build**.

---

## 1. Data Rendering — Field ID vs Field Name Mismatch

**Commits:** b1bdbaa, 4c9beb2 | **PRs:** #23, #25 | **Risk: Medium**

The API returns record values keyed by Airtable field IDs (e.g. `fldABC123`), but the UI expects human-readable field names. This caused records to render as empty rows.

**Current state:** Fixed in `DataGrid.tsx` via a `normalizeFieldKeys()` helper, but:
- Normalization happens **in the grid layer, not at data ingestion**. Other consumers (sidebar counts, interface blocks, schema designer) don't benefit from it.
- Records are re-normalized on every render — no caching at `DataContext` level.
- The grid actually normalizes keys **twice** in its `useMemo` (lines 209–227 and 237–240).

**Why this persists:** The root cause is an architectural gap — there is no single normalization layer between the API and the rest of the app.

---

## 2. Duplicate Tables in Sidebar

**Commits:** 57a3faf, a4301c2 | **PRs:** #9, #15 | **Risk: Low**

Tables appeared multiple times due to casing/whitespace differences (e.g. `"Users"` vs `"users "`).

**Current state:** Resolved via `deduplicateTables()` in `SchemaContext.tsx` (lines 118–144). The fix normalizes names and deduplicates by tableId then by normalized name, keeping the entry with the highest `recordCount`.

**Remaining concern:** Dedup only runs in SchemaContext. If tables are fetched or constructed elsewhere, duplicates could reappear.

---

## 3. Record Count Mismatch — Sidebar vs Table View

**Commits:** 227b573, 9da07b6, a4301c2 | **PRs:** #9, #11, #21 | **Risk: Medium**

The sidebar showed API metadata counts (which included `field_definition` rows), while the grid showed only actual data records.

**Current state:** Sidebar now uses loaded record array length, falling back to API metadata for unloaded tables:
```typescript
const count = loadedRecords ? loadedRecords.length : (t.recordCount ?? t.fieldCount);
```

**Why this persists:**
- The fallback to `t.fieldCount` re-introduces the exact confusion the earlier fix tried to eliminate.
- `updateRecordCount()` exists in SchemaContext but is **never called**, so schema state never reflects actual loaded counts.
- Unloaded tables always show stale/incorrect API metadata.

---

## 4. Grid and Column Layout Breakage

**Commits:** 733e5b1, 76bbdc0, 0d3807c | **PRs:** #16, #18, #24 | **Risk: Medium-High**

Three separate layout issues required three separate fixes: missing width constraints on row cells, missing grid lines, and the introduction of adjustable/draggable columns.

**Current state:** Alignment is fixed, but the drag-and-drop column system (using `@dnd-kit`) adds significant complexity:
- Resize handles interact with drag state in non-obvious ways.
- `@tanstack/react-virtual` virtualizer doesn't account for column width changes — resizing columns while scrolled can cause row misalignment.
- Column widths stored in `ViewContext` are **not persisted** — reloading the page loses all resizing.
- No min-width validation on drag (only a constant `MIN_WIDTH = 80` that isn't enforced during drag).

**Why this persists:** The grid is the most complex component in the app, combining virtualization, drag-and-drop, inline editing, and dynamic column management without a shared layout model.

---

## 5. Emitted Operations (EO) Loading and Display

**Commits:** 00946bd, 1d8a036, fd3649a | **PRs:** #17, #19 | **Risk: Medium-High**

The EO history view had three issues: events not loading, raw payload toggle breaking (click propagation), and incomplete event capture.

**Current state:** Display works, but the event system has structural issues:
- `_nextId` is a module-level counter that never resets across login/logout cycles.
- `MAX_LOCAL_OPS = 2000` is hard-coded — old ops are silently dropped with no user notification.
- No deduplication: a local edit + Matrix sync of the same change logs two entries.
- DB event fetch loads everything from the last 90 days on mount — no incremental sync.
- Matrix event listener cleanup relies on function reference equality; if the callback is recreated, `off()` fails silently.

---

## 6. Schema Designer Showing 0 Fields

**Commits:** 998001f | **PR:** #11 | **Risk: Low-Medium**

When the `/amino-fields` endpoint returned empty results, the schema designer showed "0 fields" even though records contained data.

**Current state:** Fixed with a `deriveFieldsFromRecords()` fallback that infers field names and types by scanning record data.

**Remaining concerns:**
- **Dual derivation paths:** Both `SchemaContext` and `DataGrid` can derive fields independently — they may infer different types for the same field.
- **Naive type inference:** Uses regex heuristics (e.g. `/^rec[A-Za-z0-9]{10,}$/` for linked records). If Airtable changes ID formats, inference breaks.
- **Sampling bias:** Only examines the first non-null value per field. Sparse columns may be mistyped.

---

## 7. Webhook / API Data Flow Fragility

**Commits:** f2bd48e, 3a0325f, 208f6c2, 3aef001 | **PRs:** #2, #4, #6, #7 | **Risk: High**

Four interconnected issues: missing auth tokens on webhook calls, double-encoded JSON payloads, a missing `/amino-fields` endpoint, and unhandled empty responses.

**Current state:** The most fragile area of the codebase:
- **Dual-auth retry is overbroad:** Retries on ANY network error (including timeouts), not just 401s.
- **Hard-coded webhook URL:** `WEBHOOK_BASE = 'https://n8n.intelechia.com/webhook'` with no environment variable.
- **No response validation:** After `JSON.parse()`, there's no schema validation. `{ records: "invalid" }` would crash downstream.
- **Over-flexible event extraction:** Tries `.events`, `.rows`, `.data`, and raw array shapes (lines 341–347), masking real API errors.
- **Silent data loss:** If `JSON.parse()` fails on stringified fields in `DataContext` (lines 91–94), it returns `{}` — the record loses all data silently.
- **No pagination or rate limiting:** Large tables are fetched in a single request with no backpressure.

---

## 8. TypeScript Build Is Broken

**Status: ACTIVE — Build fails with 35 errors**

`npm run build` currently fails. The errors are concentrated in three files:

| File | Error Count | Primary Issue |
|---|---|---|
| `SchemaContext.tsx` | 5 | Implicit `any` types, missing `react/jsx-runtime` |
| `ViewContext.tsx` | 28 | Cannot find module `react`, 26× implicit `any` types |
| `useFormulas.ts` | 2 | Cannot find module `react`, implicit `any` |

These are likely caused by missing or misconfigured `@types/react` declarations, combined with `strict: true` in `tsconfig.json`. The CI/CD pipeline (`deploy.yml`) runs `npm run build` before deploying — **deployments are currently blocked**.

---

## 9. Zero Test Coverage

The project has **no test files, no test framework, and no test scripts**. Given that 55% of all commits are bug fixes, many of these regressions could have been caught with basic unit tests for:
- Field key normalization
- Table deduplication
- Record count derivation
- API response parsing and normalization
- Event deduplication

---

## Cross-Cutting Patterns

| Pattern | Description | Affected Areas |
|---|---|---|
| **Silent failures** | Errors return empty results instead of throwing | API client, DataContext, EO events |
| **Wrong-layer normalization** | Data transforms happen in UI components instead of at ingestion | Field keys, field types, table dedup |
| **No shared validation** | API responses parsed ad-hoc with no schema contracts | Webhooks, events, records, fields |
| **Fallback chains mask bugs** | When source A fails, source B is tried without logging | Auth retry, field derivation, event extraction |
| **State divergence** | Same data derived independently in multiple contexts | SchemaContext vs DataGrid field inference, sidebar vs grid record counts |

---

## Recommendations

1. **Fix the build** — Resolve the 35 TypeScript errors so CI/CD can deploy again.
2. **Centralize normalization** — Move field key mapping and type inference into `DataContext` or the API client, not consuming components.
3. **Add API response validation** — Use Zod or similar to validate webhook responses at parse time.
4. **Replace silent failures with explicit errors** — Log and surface unexpected data shapes instead of returning empty objects.
5. **Add basic tests** — Start with the most-regressed areas: key normalization, table dedup, record counting, API parsing.
6. **Externalize configuration** — Move `WEBHOOK_BASE` and `MAX_LOCAL_OPS` to environment variables.
7. **Implement proper error boundaries** — Catch rendering failures from bad data before they blank the entire UI.
