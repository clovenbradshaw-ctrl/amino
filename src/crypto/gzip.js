/**
 * gzip.js — streaming gzip codec for import blobs.
 *
 * Import datasets (CSV/JSON) are highly compressible (repeated names, structure)
 * and the biggest cost of "downloading 1M records from Matrix" is the size of
 * the one media blob: it drives download bandwidth, OPFS storage, and — the hard
 * ceiling — whether the upload fits under the homeserver's `max_upload_size`
 * (~50 MB on a default Synapse). Gzipping the blob before it is encrypted cuts
 * all three by ~5–10× for tabular text, so far more rows fit in a single blob.
 *
 * Uses the platform-native CompressionStream / DecompressionStream (browser +
 * Node 18+), so no dependency and the same code path runs in the app and in
 * tests. Compression happens BEFORE encryption; for static file-at-rest storage
 * (no adaptive chosen-plaintext oracle) that ordering is safe and standard.
 */

// Round-trip a byte array through a transform stream (gzip/gunzip).
async function through(bytes, transform) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const stream = new Blob([input]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gzipBytes(bytes) {
  return through(bytes, new CompressionStream('gzip'));
}

export async function gunzipBytes(bytes) {
  return through(bytes, new DecompressionStream('gzip'));
}
