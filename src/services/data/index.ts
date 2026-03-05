// API
export { fetchTables, fetchRecords, fetchRecordsSince, apiFetch } from './api';

// EO Operations
export { normalizeFieldOps, applyFieldOps } from './eo-ops';

// Encryption
export {
  deriveKey,
  deriveSynapseKey,
  encrypt,
  decrypt,
  encryptToBase64,
  decryptFromBase64,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  exportKeyToStorage,
  importKeyFromStorage,
  clearKeyFromStorage,
  createVerificationToken,
  verifyEncryptionKey,
} from './encryption';

// IndexedDB Store
export {
  openDatabase,
  closeDatabase,
  deleteDatabase,
  getDatabase,
  putRecord,
  putRecordsBatch,
  getRecord,
  getRecordsByTable,
  deleteTableRecords,
  clearRecords,
  getRecordCount,
  encryptAllRecords,
  putTable,
  putTablesBatch,
  getTables,
  clearTables,
  getSyncCursor,
  putSyncCursor,
  getAllSyncCursors,
  clearSyncState,
  putViewState,
  getViewState,
  getAllViewStates,
  clearViewState,
  putPreference,
  getPreference,
  deletePreference,
  clearPreferences,
} from './idb-store';

// Record Cache
export * as recordCache from './record-cache';

// Search Index
export * as searchIndex from './search-index';

// Hydration
export {
  run as runHydration,
  hydrateTable,
  syncTable,
  hydrateTableFromPostgres,
  syncTableFromPostgres,
  getConfig as getHydrationConfig,
} from './hydration';
export type { HydrationOptions, HydrateContext } from './hydration';

// Sync Dedup
export {
  markEventProcessed,
  isDuplicate,
  trackEvent,
  trackOptimisticWrite,
  trackOptimisticEcho,
  isOptimisticEcho,
  pruneOptimisticWrites,
  getCachedCursor,
  updateCursorCache,
  reset as resetSyncDedup,
} from './sync-dedup';

// Types
export type {
  AminoRecord,
  AminoTable,
  FieldOps,
  FieldMetadata,
  FieldHistoryEntry,
  SyncEvent,
  HydrationProgress,
  HydrationTier,
  HydrationResult,
  HydrationConfig,
  TableOrderStrategy,
  RecordMutation,
  SyncCursor,
  ResolvedCursor,
  IDBRecordEntry,
  TablesResponse,
  RecordsResponse,
  EOEventContent,
} from './types';
