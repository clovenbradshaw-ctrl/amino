/* rows.worker.js — materialize import blobs off the main thread (SCALING.md
 * Phase 1: "the single biggest win").
 *
 * The main thread reads + decrypts the media blob (that needs the vault/keys and
 * MatrixLive, which only live there), then posts the raw text here. This worker
 * streams the parse and maps rows via the pure AminoMaterialize module, posting
 * results back in batches so a huge set fills in progressively instead of
 * freezing the tab. No DOM, no Matrix — just text in, rows out.
 *
 * Protocol (postMessage):
 *   → { type:'materialize', id, text, fieldPlan, setName, shape, hasHeader,
 *       importAnchor, created, sender, eventId, batchSize }
 *   ← { type:'batch', id, setName, rows, seq }      (0..N, as rows are parsed)
 *   ← { type:'done',  id, setName, total }          (once, terminal)
 *   ← { type:'error', id, message }                 (on failure)
 */
'use strict';
importScripts('rows-materialize.js');

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type !== 'materialize') return;
  const { id, text, setName } = msg;
  try {
    let seq = 0, total = 0;
    total = self.AminoMaterialize.materialize(text, {
      fieldPlan: msg.fieldPlan,
      setName: msg.setName,
      shape: msg.shape,
      hasHeader: msg.hasHeader,
      importAnchor: msg.importAnchor,
      created: msg.created,
      sender: msg.sender,
      eventId: msg.eventId,
      batchSize: msg.batchSize,
    }, rows => {
      self.postMessage({ type: 'batch', id, setName, rows, seq: seq++ });
    });
    self.postMessage({ type: 'done', id, setName, total });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: (err && err.message) || String(err) });
  }
};
