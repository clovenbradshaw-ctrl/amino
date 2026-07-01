# AMINO — Performance baseline

*Placeholder created alongside `BUILD-PLAN.md` / `SCALING.md`. Populate in
**Phase 0 / Phase 1 (Spine)** once the perf harness lands.*

Per `SCALING.md` Phase 0, seed a synthetic import at 10k / 100k / 500k / 1M rows
(reusing the real `field_plan` shape) and record wall-clock for each operation.
Every later phase reports against these numbers.

## Acceptance bar (definition of done)

On a 1M-row imported set, mid-range laptop, after the spine + view work:

- First paint of the Database view **≤ 500 ms**
- Switching tabs / sets **≤ 200 ms**
- Search keystroke input latency **≤ 100 ms**; results page **≤ 150 ms**
- Scroll-to-load a page: no dropped frames
- Main thread never blocked **> 50 ms** in steady state
- Peak JS heap scales with open sets' column memory + one viewport of rows —
  the full 1M object graph never exists in `state.entities`

## Measurements

| Rows | Blob parse | augmentState | buildTable | first listSets | 1 search | 1 link resolve |
|------|-----------|--------------|-----------|----------------|----------|----------------|
| 10k   | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 100k  | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 500k  | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| 1M    | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
