/* rows-worker-client.js — main-thread client for public/rows.worker.js.
 *
 * The seam between the app and the off-thread materializer. The main thread owns
 * the vault/keys, so it reads + decrypts the media blob here, then hands the raw
 * text to the worker for the expensive parse + row mapping. Rows come back in
 * batches (progressive fill) and resolve to the same shape as
 * AminoRows.materializeImportRows — a drop-in that no longer freezes the tab.
 *
 * If Web Workers are unavailable (or the worker fails to boot), it falls back to
 * running the SAME pure AminoMaterialize logic on the main thread, so behaviour
 * is identical — just not offloaded. Exposes window.AminoRowsWorker.
 */
(function () {
  'use strict';

  let worker = null, nextId = 1, booted = false, bootFailed = false;
  const pending = new Map(); // id -> { resolve, reject, rows, onBatch }

  function boot() {
    if (booted || bootFailed) return worker;
    booted = true;
    try {
      worker = new Worker('/rows.worker.js');
      worker.onmessage = onMessage;
      worker.onerror = () => { bootFailed = true; }; // fall back on next call
    } catch (e) {
      bootFailed = true;
      worker = null;
    }
    return worker;
  }

  function onMessage(e) {
    const msg = e.data || {};
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'batch') {
      for (const r of msg.rows) p.rows.push(r);
      if (p.onBatch) { try { p.onBatch(msg.rows, msg.setName); } catch (_) {} }
    } else if (msg.type === 'done') {
      pending.delete(msg.id);
      p.resolve(p.rows);
    } else if (msg.type === 'error') {
      pending.delete(msg.id);
      p.reject(new Error(msg.message || 'rows.worker error'));
    }
  }

  const available = () => typeof Worker !== 'undefined';

  // Read + decrypt the blob on the main thread, decode to text (mirrors
  // import-rows.js), then materialize. `readMedia` is MatrixLive.readMedia.
  async function blobText(ref, readMedia) {
    const bytes = await readMedia(ref);
    if (!bytes) return null;
    if (typeof bytes === 'string')        return bytes;
    if (bytes instanceof Blob)            return await bytes.text();
    if (bytes instanceof Uint8Array)      return new TextDecoder().decode(bytes);
    if (bytes instanceof ArrayBuffer)     return new TextDecoder().decode(new Uint8Array(bytes));
    return null;
  }

  function optsFrom(importEntity) {
    return {
      fieldPlan: importEntity.field_plan,
      setName: importEntity.derived_set,
      shape: importEntity.shape,
      hasHeader: importEntity.has_header !== false,
      importAnchor: importEntity._anchor,
      created: importEntity._created,
      sender: importEntity._sender,
      eventId: importEntity._eventId,
    };
  }

  // Returns rows[] (like AminoRows.materializeImportRows) or null if the source
  // isn't ready yet. `onBatch(rows, setName)` fires progressively when offloaded.
  async function materialize(importEntity, readMedia, options) {
    options = options || {};
    if (!importEntity || !importEntity._anchor) return null;
    const ref = importEntity.file, fieldPlan = importEntity.field_plan, setName = importEntity.derived_set;
    if (!readMedia || !ref || !Array.isArray(fieldPlan) || !setName) return null;

    let text;
    try { text = await blobText(ref, readMedia); }
    catch (e) { console.warn('[rows-worker] could not read source blob:', e); return null; }
    if (text == null) return null;

    const opts = optsFrom(importEntity);

    const w = boot();
    if (w && !bootFailed) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject, rows: [], onBatch: options.onBatch });
        w.postMessage(Object.assign({ type: 'materialize', id, text }, opts, { batchSize: options.batchSize }));
      }).catch(() => materializeOnMain(text, opts, options)); // worker died mid-flight → fall back
    }
    return materializeOnMain(text, opts, options);
  }

  // Fallback: run the identical pure logic inline (no offload).
  function materializeOnMain(text, opts, options) {
    const AM = window.AminoMaterialize;
    if (!AM) return null;
    const rows = [];
    AM.materialize(text, Object.assign({}, opts, { batchSize: options && options.batchSize }), batch => {
      for (const r of batch) rows.push(r);
      if (options && options.onBatch) { try { options.onBatch(batch, opts.setName); } catch (_) {} }
    });
    return rows;
  }

  window.AminoRowsWorker = { available, materialize };
})();
