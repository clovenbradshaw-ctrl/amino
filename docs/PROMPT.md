# Engineering brief — AMINO Immigration (RK Lacy Law)

You're shipping a production CRM / case-management app for an immigration law firm.
A **working design prototype** is included (`prototype/amino-prototype.html`) — open it
in a browser to see every screen, interaction, and the intended data model. Your job is
to turn it into a real app on the **bare-metal / matrix-events backend** (`backend/src/`).

## The architecture (read first)

There is **no backend to build**. Rooms are tables, events are rows, `fold(events)` is the
query, and a stock Matrix homeserver stores only **end-to-end-encrypted ciphertext**.
Full design: `backend/README.md`, `backend/BUILDING.md`. Don't add a database, an API
tier, or an auth service — the whole point is that those don't exist here.

- **Auth** = Matrix login. The user signs in with a Matrix ID + password.
  **The homeserver is hardcoded** to `https://app.aminoimmigration.com` — the sign-in
  screen only asks for ID + password (already wired this way in the prototype).
- **Data** = append-only operator events in encrypted rooms. Every change is one of the
  seven stored operators (`INS, SEG, CON, SYN, DEF, EVA, REC`). State is **derived**, never
  stored: `state = fold(events)`.
- **Foundation modules** (use these, don't reinvent): `backend/src/client.js`
  (`login`, `restoreSession`, `logout`, `getClient`), `backend/src/operators.js`
  (`setNamespace`, `ins`, `def`, `con`, …), `backend/src/fold.js` (`fold`, `foldFrom`,
  `entitiesOfType`), `backend/src/rooms.js` (`createRoom`, `discoverRooms`, `getTimeline`,
  `onTimeline`).

## What the prototype already establishes

- **Namespace:** `app.aminoimmigration` (call `setNamespace('app.aminoimmigration')` at startup).
- **Entity types:** `client`, `case`, `note`, plus relationship edges via `CON`.
- **Mutations are already event-sourced in the prototype** against a local stand-in log:
  a field edit emits **DEF** (`anchor: client_<id>`, `path: <Field Name>`, `value`), and a
  case note emits **INS** (`entity_type: note`, payload `{ci, text}`). Swap the local log
  for the real Matrix transport — the operator/fold contract is unchanged.
- **Data model:** `schema/Amino.schema.json` — the real Airtable-derived tables and field
  names (Client Info: 2,166 rows; Case Master View: 13,494; case_notes: 119,375). Use these
  exact field names. Relationship links (Custodian / Abandoning Parent / Notified_Parent /
  related_client, and Case Master ↔ Client Info) map to `CON` edges.

## Build tasks

1. **Stand up the homeserver** (Synapse/Conduit/Dendrite) at `app.aminoimmigration.com`
   with E2EE enforced. Create the firm's user accounts (this is also the "user management"
   surface — admin creates Matrix users; role = membership + power levels per room).
2. **Wire the real transport.** Replace the prototype's local-log stand-in with
   `client.js` login → `rooms.js` discover/getTimeline/onTimeline → `fold.js`. One **room per
   client** (the customer can be a member and audit/leave); the firm's dashboard is a *fold
   across the rooms the staff member belongs to*, projected client-side.
3. **Import the existing data** from Airtable (`schema/Amino.schema.json` is the map) into
   per-client rooms as `INS` + `DEF` events. Treat the import as a one-time replay.
4. **Keep every prototype screen & interaction**: the single disclosing left panel
   (Workspace ↔ Client Info, drag-to-resize, collapse), the customizable Record Panel with
   foldered + favoritable layouts (Edit Client Info / EAD / Court / USCIS FOIA), the record
   tabs (Client Info / At-a-glance / Matters / Case Notes / EAD / Box / Related Individuals /
   Deadlines), Related Individuals (CON edges), the Airtable-style Database (table tabs +
   views sidebar + in-place record detail drawer), and the quick-action toolbar.
5. **Mount the AI "Ask your data" view** from the Cleo reading engine
   (see `backend/README.md` → "Ask your data"). It reads the same fold; it never writes.

## Tech notes

- The prototype is a single self-contained HTML file built as a "Design Component" — treat
  it as the **visual + interaction spec**, not the production codebase. Rebuild the UI in
  your framework of choice (the modules are framework-agnostic ESM) OR lift the markup; either
  way the operator/fold data layer below it is fixed by `backend/src/`.
- `npm install && npm run dev` in `backend/` runs the reference app; `BUILDING.md` has the
  cross-app interop contract (namespace + entity taxonomy + field paths + schema-as-log).
- Heavy bits (matrix-js-sdk + Rust-crypto WASM, IndexedDB/OPFS, the on-device model) need a
  real build + a running homeserver — they can't run inside a static design preview, which is
  why the prototype uses a local stand-in log.

## Definition of done

A staff member opens the app, signs in with their Matrix ID + password (homeserver
pre-filled), sees their clients folded from encrypted rooms, edits a field → a `DEF` event
lands in that client's room and every member sees it, and a client they're removed from
disappears from their view. No central database. No API keys. Signed JSON they can export.
