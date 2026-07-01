// Verifies the import-blob gzip codec (src/crypto/gzip.js): a lossless
// round-trip, and that immigration-shaped CSV compresses far enough to matter
// for downloading from Matrix (bandwidth + OPFS + fitting under max_upload_size).
// Also checks the read-path contract: only refs marked enc:'gzip' are inflated.
import assert from 'assert';
import { gzipBytes, gunzipBytes } from '../src/crypto/gzip.js';

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok ', m); };

const enc = new TextEncoder(), dec = new TextDecoder();

// ── lossless round-trip (text + binary) ──
const text = enc.encode('Family Name,First Name,A#\nLopez,Maria,300\n"Nguyen, Jr",Bao,100\n');
const gz = await gzipBytes(text);
const back = await gunzipBytes(gz);
ok(dec.decode(back) === dec.decode(text), 'gzip → gunzip is lossless for text (incl. quoted commas)');

const bin = new Uint8Array(1000); for (let i = 0; i < bin.length; i++) bin[i] = (i * 31) & 0xff;
ok(dec.decode(await gunzipBytes(await gzipBytes(bin))) === dec.decode(bin), 'gzip → gunzip is lossless for arbitrary bytes');
ok((await gunzipBytes(await gzipBytes(new Uint8Array(0)))).length === 0, 'empty input round-trips to empty');

// ── realistic ratio: immigration CSV compresses ~10×+ ──
const FAM = ['Lopez','Nguyen','Adams','Zimmer','Khan','Garcia','Okafor','Silva','Cohen','Tran'];
const FIRST = ['Maria','Bao','John','Ana','Omar','Luis','Chidi','Paulo','Sara','Mai'];
const RELIEF = ['Asylum','Cancellation','Adjustment','TPS','Withholding'];
const STATUS = ['Open','Pending','Closed','Hearing Set'];
let csv = 'Family Name,First Name,A#,Relief Sought,Case Status,NTA Date\n';
const rows = [];
for (let i = 0; i < 20000; i++) {
  const d = new Date(Date.UTC(2025, 0, 1) + (i % 900) * 86400000).toISOString().slice(0, 10);
  rows.push(`${FAM[i % 10]},${FIRST[(i * 7) % 10]},${100000000 + i},${RELIEF[i % 5]},${STATUS[i % 4]},${d}`);
}
csv += rows.join('\n') + '\n';
const raw = enc.encode(csv);
const comp = await gzipBytes(raw);
const ratio = comp.length / raw.length;
console.log(`  (20k-row CSV: ${(raw.length / 1024).toFixed(0)} KB → ${(comp.length / 1024).toFixed(0)} KB, ${(ratio * 100).toFixed(1)}%)`);
ok(ratio < 0.2, `immigration CSV compresses below 20% of original (got ${(ratio * 100).toFixed(1)}%)`);
ok(dec.decode(await gunzipBytes(comp)) === csv, 'the compressed CSV round-trips back byte-for-byte');

// ── read-path contract: inflate iff the ref is marked gzip ──
// Mirrors getMediaBytes' `inflate` (stored bytes are gzip when ref.enc says so).
const inflate = async (ref, stored) => (stored && ref.enc === 'gzip' ? await gunzipBytes(stored) : stored);
ok(dec.decode(await inflate({ enc: 'gzip' }, comp)) === csv, 'a gzip-marked ref is decompressed on read');
ok(dec.decode(await inflate({}, raw)) === csv, 'a legacy (unmarked) ref is returned verbatim — backward compatible');

console.log(`\ngzip.test: ${pass} assertions passed`);
