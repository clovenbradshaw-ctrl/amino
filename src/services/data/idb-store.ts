// =============================================================================
// Amino IndexedDB Store — Encrypted Local Storage
//
// Ported from data-layer.js (lines 275-575). Uses the `idb` library for
// a promise-based IndexedDB API. Data is encrypted at rest using AES-GCM-256.
//
// Database: 'amino-data'
// Object Stores:
//   - records       keyPath: 'id', index: byTable(tableId), byLastSynced(lastSynced)
//   - tables        keyPath: 'table_id'
//   - syncState     keyPath: 'tableId'
//   - viewState     keyPath: 'id'
//   - userPreferences keyPath: 'key'
//
// Encryption strategy:
//   - Deferred mode (active session): store plaintext JSON strings in IDB,
//     encrypt everything on logout for faster writes during normal use.
//   - Immediate mode: encrypt before every write (used by sub-pages).
//   - On read: auto-detect plaintext string vs encrypted ArrayBuffer.
// =============================================================================

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { encrypt, decrypt } from './encryption';
import type {
  AminoRecord,
  AminoTable,
  IDBRecordEntry,
  SyncCursor,
  RecordMutation,
} from './types';

const DB_NAME = 'amino-data';
const DB_VERSION = 2;

// =============================================================================
// Database Schema & Open
// =============================================================================

export interface AminoDBSchema {
  records: {
    key: string;
    value: IDBRecordEntry;
    indexes: {
      byTable: string;
      byLastSynced: string;
    };
  };
  tables: {
    key: string;
    value: AminoTable;
  };
  syncState: {
    key: string;
    value: SyncCursor;
  };
  viewState: {
    key: string;
    value: { id: string; [k: string]: any };
  };
  userPreferences: {
    key: string;
    value: { key: string; value: any };
  };
}

let _db: IDBPDatabase<AminoDBSchema> | null = null;

/**
 * Open (or create) the amino-data IndexedDB database.
 * Handles schema upgrades. Returns the database instance.
 */
export async function openDatabase(): Promise<IDBPDatabase<AminoDBSchema>> {
  if (_db) return _db;

  _db = await openDB<AminoDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Records store
      if (!db.objectStoreNames.contains('records')) {
        const recordStore = db.createObjectStore('records', { keyPath: 'id' });
        recordStore.createIndex('byTable', 'tableId', { unique: false });
        recordStore.createIndex('byLastSynced', 'lastSynced', { unique: false });
      }

      // Tables store
      if (!db.objectStoreNames.contains('tables')) {
        db.createObjectStore('tables', { keyPath: 'table_id' });
      }

      // Sync state store (per-table cursors)
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState', { keyPath: 'tableId' });
      }

      // View state store
      if (!db.objectStoreNames.contains('viewState')) {
        db.createObjectStore('viewState', { keyPath: 'id' });
      }

      // User preferences store
      if (!db.objectStoreNames.contains('userPreferences')) {
        db.createObjectStore('userPreferences', { keyPath: 'key' });
      }
    },
  });

  return _db;
}

/** Close the database connection and reset the cached reference. */
export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Delete the entire database (destructive). */
export async function deleteDatabase(): Promise<void> {
  closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Get the current database instance (throws if not opened). */
export function getDatabase(): IDBPDatabase<AminoDBSchema> {
  if (!_db) throw new Error('Database not opened. Call openDatabase() first.');
  return _db;
}

// =============================================================================
// Records — CRUD with encryption
// =============================================================================

/**
 * Store a record in IndexedDB, encrypting the fields if a key is provided.
 *
 * @param record         - The record to store
 * @param cryptoKey      - AES-GCM key for encryption (null = store plaintext)
 * @param deferEncryption - If true, store as plaintext JSON string (encrypt on logout)
 */
export async function putRecord(
  record: AminoRecord,
  cryptoKey: CryptoKey | null,
  deferEncryption = false,
): Promise<void> {
  const db = getDatabase();
  const fieldsJson = JSON.stringify(record.fields);

  let storedFields: ArrayBuffer | string;
  if (!cryptoKey || deferEncryption) {
    storedFields = fieldsJson;
  } else {
    storedFields = await encrypt(cryptoKey, fieldsJson);
  }

  const entry: IDBRecordEntry = {
    id: record.id,
    tableId: record.tableId,
    tableName: record.tableName,
    fields: storedFields,
    lastSynced: record.lastSynced,
  };

  await db.put('records', entry);
}

/**
 * Store multiple records in a single transaction (batched write).
 *
 * @param records        - Records to store
 * @param cryptoKey      - AES-GCM key for encryption
 * @param deferEncryption - Store as plaintext if true
 */
export async function putRecordsBatch(
  records: AminoRecord[],
  cryptoKey: CryptoKey | null,
  deferEncryption = false,
): Promise<void> {
  const db = getDatabase();
  const tx = db.transaction('records', 'readwrite');
  const store = tx.objectStore('records');

  for (const record of records) {
    const fieldsJson = JSON.stringify(record.fields);
    let storedFields: ArrayBuffer | string;
    if (!cryptoKey || deferEncryption) {
      storedFields = fieldsJson;
    } else {
      storedFields = await encrypt(cryptoKey, fieldsJson);
    }

    await store.put({
      id: record.id,
      tableId: record.tableId,
      tableName: record.tableName,
      fields: storedFields,
      lastSynced: record.lastSynced,
    });
  }

  await tx.done;
}

/**
 * Read and decrypt a single record from IndexedDB.
 *
 * @param recordId  - The record's ID
 * @param cryptoKey - AES-GCM key for decryption
 * @returns The decrypted AminoRecord, or null if not found
 */
export async function getRecord(
  recordId: string,
  cryptoKey: CryptoKey | null,
): Promise<AminoRecord | null> {
  const db = getDatabase();
  const entry = await db.get('records', recordId);
  if (!entry) return null;
  return decryptEntry(entry, cryptoKey);
}

/**
 * Read and decrypt all records for a table.
 *
 * @param tableId   - Table ID to filter by
 * @param cryptoKey - AES-GCM key for decryption
 * @returns Array of decrypted AminoRecord objects
 */
export async function getRecordsByTable(
  tableId: string,
  cryptoKey: CryptoKey | null,
): Promise<AminoRecord[]> {
  const db = getDatabase();
  const entries = await db.getAllFromIndex('records', 'byTable', tableId);
  return Promise.all(entries.map((e) => decryptEntry(e, cryptoKey)));
}

/**
 * Delete all records for a table from IndexedDB.
 */
export async function deleteTableRecords(tableId: string): Promise<void> {
  const db = getDatabase();
  const tx = db.transaction('records', 'readwrite');
  const index = tx.objectStore('records').index('byTable');
  let cursor = await index.openCursor(tableId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/**
 * Clear all records from the store.
 */
export async function clearRecords(): Promise<void> {
  const db = getDatabase();
  await db.clear('records');
}

/**
 * Get the total count of records in IndexedDB (O(1) via IDB count()).
 */
export async function getRecordCount(): Promise<number> {
  const db = getDatabase();
  return db.count('records');
}

// =============================================================================
// Decrypt Helper
// =============================================================================

/**
 * Decrypt an IDB record entry to an AminoRecord.
 * Auto-detects plaintext string vs encrypted ArrayBuffer.
 */
async function decryptEntry(
  entry: IDBRecordEntry,
  cryptoKey: CryptoKey | null,
): Promise<AminoRecord> {
  let fields: Record<string, any>;

  if (typeof entry.fields === 'string') {
    // Plaintext JSON (deferred-encryption mode or crash recovery)
    fields = JSON.parse(entry.fields);
  } else if (cryptoKey) {
    // Encrypted ArrayBuffer
    const plaintext = await decrypt(cryptoKey, entry.fields);
    fields = JSON.parse(plaintext);
  } else {
    throw new Error(
      'Record fields are encrypted but no crypto key was provided',
    );
  }

  return {
    id: entry.id,
    tableId: entry.tableId,
    tableName: entry.tableName,
    fields,
    lastSynced: entry.lastSynced,
  };
}

// =============================================================================
// Bulk Encryption (encrypt-on-logout)
// =============================================================================

/**
 * Encrypt all plaintext records in IndexedDB. Called on logout to ensure
 * data-at-rest is encrypted. Processes in batches of 200.
 *
 * @param cryptoKey - AES-GCM key for encryption
 * @returns Number of records encrypted
 */
export async function encryptAllRecords(cryptoKey: CryptoKey): Promise<number> {
  const db = getDatabase();
  const BATCH_SIZE = 200;
  let encrypted = 0;

  const allEntries = await db.getAll('records');

  for (let b = 0; b < allEntries.length; b += BATCH_SIZE) {
    const batch = allEntries.slice(b, b + BATCH_SIZE);
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');

    for (const entry of batch) {
      if (typeof entry.fields === 'string') {
        const encryptedFields = await encrypt(cryptoKey, entry.fields);
        await store.put({ ...entry, fields: encryptedFields });
        encrypted++;
      }
    }
    await tx.done;
  }

  console.log(`[IDB] Encrypted ${encrypted} plaintext records on logout`);
  return encrypted;
}

// =============================================================================
// Tables Store
// =============================================================================

/** Store table metadata. */
export async function putTable(table: AminoTable): Promise<void> {
  const db = getDatabase();
  await db.put('tables', table);
}

/** Store multiple tables in a single transaction. */
export async function putTablesBatch(tables: AminoTable[]): Promise<void> {
  const db = getDatabase();
  const tx = db.transaction('tables', 'readwrite');
  for (const table of tables) {
    await tx.objectStore('tables').put(table);
  }
  await tx.done;
}

/** Get all stored tables. */
export async function getTables(): Promise<AminoTable[]> {
  const db = getDatabase();
  return db.getAll('tables');
}

/** Clear all table metadata. */
export async function clearTables(): Promise<void> {
  const db = getDatabase();
  await db.clear('tables');
}

// =============================================================================
// Sync State Store (per-table cursors)
// =============================================================================

/** Read the sync cursor for a table. */
export async function getSyncCursor(
  tableId: string,
): Promise<SyncCursor | null> {
  const db = getDatabase();
  const cursor = await db.get('syncState', tableId);
  return cursor || null;
}

/**
 * Write a sync cursor. Enforces monotonic advance (never regresses).
 * Returns the cursor value that was written.
 */
export async function putSyncCursor(cursor: SyncCursor): Promise<string> {
  const db = getDatabase();

  // Enforce monotonic advance
  const existing = await db.get('syncState', cursor.tableId);
  if (existing && existing.lastSynced && existing.lastSynced >= cursor.lastSynced) {
    console.log(
      `[IDB] Cursor for ${cursor.tableId} already at ${existing.lastSynced} -- not regressing to ${cursor.lastSynced}`,
    );
    return existing.lastSynced;
  }

  await db.put('syncState', cursor);
  return cursor.lastSynced;
}

/** Get all sync cursors. */
export async function getAllSyncCursors(): Promise<SyncCursor[]> {
  const db = getDatabase();
  return db.getAll('syncState');
}

/** Clear all sync cursors. */
export async function clearSyncState(): Promise<void> {
  const db = getDatabase();
  await db.clear('syncState');
}

// =============================================================================
// View State Store
// =============================================================================

/** Store view state. */
export async function putViewState(
  id: string,
  state: Record<string, any>,
): Promise<void> {
  const db = getDatabase();
  await db.put('viewState', { id, ...state });
}

/** Get view state by ID. */
export async function getViewState(
  id: string,
): Promise<Record<string, any> | null> {
  const db = getDatabase();
  const entry = await db.get('viewState', id);
  return entry || null;
}

/** Get all view states. */
export async function getAllViewStates(): Promise<
  Array<{ id: string; [k: string]: any }>
> {
  const db = getDatabase();
  return db.getAll('viewState');
}

/** Clear all view states. */
export async function clearViewState(): Promise<void> {
  const db = getDatabase();
  await db.clear('viewState');
}

// =============================================================================
// User Preferences Store
// =============================================================================

/** Store a user preference. */
export async function putPreference(
  key: string,
  value: any,
): Promise<void> {
  const db = getDatabase();
  await db.put('userPreferences', { key, value });
}

/** Get a user preference by key. */
export async function getPreference(key: string): Promise<any | null> {
  const db = getDatabase();
  const entry = await db.get('userPreferences', key);
  return entry ? entry.value : null;
}

/** Delete a user preference. */
export async function deletePreference(key: string): Promise<void> {
  const db = getDatabase();
  await db.delete('userPreferences', key);
}

/** Clear all user preferences. */
export async function clearPreferences(): Promise<void> {
  const db = getDatabase();
  await db.clear('userPreferences');
}
