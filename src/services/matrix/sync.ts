// ============================================================================
// Matrix Sync Module
// Ported from matrix.js sync loop and event listener system
// Long-polls /sync and dispatches custom events
// ============================================================================

import type {
  SyncResponse,
  StateEvent,
  RoomEvent,
  SyncEventData,
  EventCallback,
} from './types';
import { EVENT_TYPES } from './types';
import { requestWithRetry } from './client';
import { saveSessionWithSyncToken } from './auth';

// ============ Internal State ============

let _syncToken: string | null = null;
let _syncRunning = false;
let _syncAbort: AbortController | null = null;

/** In-memory room cache: roomId -> { state: { key -> event }, timeline: event[] } */
const _rooms: Record<
  string,
  {
    state: Record<string, StateEvent>;
    timeline: RoomEvent[];
  }
> = {};

/** Event listeners: eventType -> callbacks */
const _listeners: Record<string, EventCallback[]> = {};

// ============ Custom Amino Sync Events ============

/** Maps Matrix event types to custom Amino event names for dispatch */
const AMINO_EVENT_MAP: Record<string, string> = {
  [EVENT_TYPES.RECORD]: 'amino:record-updated',
  [EVENT_TYPES.RECORD_MUTATE]: 'amino:record-updated',
  [EVENT_TYPES.RECORD_CREATE]: 'amino:record-updated',
  [EVENT_TYPES.RECORD_UPDATE]: 'amino:record-updated',
  [EVENT_TYPES.RECORD_DELETE]: 'amino:record-updated',
  [EVENT_TYPES.SCHEMA_TABLE]: 'amino:schema-changed',
  [EVENT_TYPES.SCHEMA_FIELD]: 'amino:schema-changed',
  [EVENT_TYPES.SCHEMA_OBJECT]: 'amino:schema-changed',
  [EVENT_TYPES.VIEW]: 'amino:view-changed',
  [EVENT_TYPES.VIEW_SHARE]: 'amino:view-changed',
  [EVENT_TYPES.VIEW_DELETE]: 'amino:view-changed',
  [EVENT_TYPES.INTERFACE]: 'amino:interface-changed',
  [EVENT_TYPES.ORG_CONFIG]: 'amino:org-config-changed',
  [EVENT_TYPES.ORG_MEMBER]: 'amino:org-member-changed',
  [EVENT_TYPES.CLIENT_MESSAGE]: 'amino:client-message',
  [EVENT_TYPES.NOTE_INTERNAL]: 'amino:note-added',
  [EVENT_TYPES.USER_PREFERENCES]: 'amino:preferences-changed',
};

// ============ Event Emitter ============

/**
 * Register a listener for a sync event type.
 *
 * Ported from matrix.js `on()`.
 */
export function on(eventType: string, callback: EventCallback): void {
  if (!_listeners[eventType]) _listeners[eventType] = [];
  _listeners[eventType].push(callback);
}

/**
 * Remove a listener for a sync event type.
 *
 * Ported from matrix.js `off()`.
 */
export function off(eventType: string, callback: EventCallback): void {
  if (!_listeners[eventType]) return;
  _listeners[eventType] = _listeners[eventType].filter(
    (cb) => cb !== callback,
  );
}

/**
 * Emit an event to all registered listeners.
 *
 * Ported from matrix.js `_emit()`.
 */
function _emit(eventType: string, data: SyncEventData): void {
  const cbs = _listeners[eventType] || [];
  cbs.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('[Matrix] Listener error:', e);
    }
  });
}

// ============ State Processing ============

/**
 * Process a state event and store it in the room cache.
 *
 * Ported from matrix.js `_processStateEvent()`.
 */
function _processStateEvent(roomId: string, event: StateEvent): void {
  if (!_rooms[roomId]) _rooms[roomId] = { state: {}, timeline: [] };
  const key = event.type + '|' + (event.state_key || '');
  _rooms[roomId].state[key] = event;
}

/**
 * Dispatch Amino-specific events based on the Matrix event type.
 */
function _dispatchAminoEvent(roomId: string, event: RoomEvent): void {
  // Dispatch the raw Matrix event type
  _emit(event.type, { roomId, event });

  // Dispatch mapped Amino event if applicable
  const aminoEvent = AMINO_EVENT_MAP[event.type];
  if (aminoEvent) {
    _emit(aminoEvent, { roomId, event });
  }

  // Always dispatch a catch-all sync event
  _emit('amino:sync', { roomId, event });
}

// ============ Sync Loop ============

/**
 * Perform the initial sync (timeout=0) to populate room state.
 *
 * Ported from matrix.js `initialSync()`.
 */
export async function initialSync(): Promise<SyncResponse> {
  const params: Record<string, string> = {
    timeout: '0',
    filter: JSON.stringify({
      room: {
        state: { lazy_load_members: true },
        timeline: { limit: 1 },
      },
    }),
  };

  if (_syncToken) params.since = _syncToken;

  const data = await requestWithRetry<SyncResponse>(
    'GET',
    '/sync',
    null,
    params,
  );

  _syncToken = data.next_batch;
  saveSessionWithSyncToken(_syncToken);

  // Process joined rooms
  _processJoinedRooms(data);

  return data;
}

/**
 * Process joined rooms from a sync response.
 */
function _processJoinedRooms(data: SyncResponse): void {
  if (!data.rooms?.join) return;

  for (const [roomId, room] of Object.entries(data.rooms.join)) {
    if (!_rooms[roomId]) _rooms[roomId] = { state: {}, timeline: [] };

    // Process state events
    if (room.state?.events) {
      for (const event of room.state.events) {
        _processStateEvent(roomId, event as StateEvent);
      }
    }

    // Process timeline events (may include state)
    if (room.timeline?.events) {
      for (const event of room.timeline.events) {
        if ((event as StateEvent).state_key !== undefined) {
          _processStateEvent(roomId, event as StateEvent);
        }
        // Dispatch events from the sync
        _dispatchAminoEvent(roomId, event);
      }
    }
  }
}

/**
 * Start the long-polling sync loop.
 * Continuously polls `/sync` with a 30-second timeout.
 *
 * Ported from matrix.js sync pattern.
 */
export async function startSync(): Promise<void> {
  if (_syncRunning) return;
  _syncRunning = true;

  // Run initial sync first
  try {
    await initialSync();
  } catch (e) {
    console.error('[Matrix] Initial sync failed:', e);
    _syncRunning = false;
    throw e;
  }

  // Start the long-poll loop
  _pollLoop();
}

/**
 * Internal long-poll loop. Runs continuously until stopSync() is called.
 */
async function _pollLoop(): Promise<void> {
  while (_syncRunning) {
    try {
      _syncAbort = new AbortController();

      const params: Record<string, string> = {
        timeout: '30000',
        filter: JSON.stringify({
          room: {
            state: { lazy_load_members: true },
            timeline: { limit: 50 },
          },
        }),
      };

      if (_syncToken) params.since = _syncToken;

      const data = await requestWithRetry<SyncResponse>(
        'GET',
        '/sync',
        null,
        params,
      );

      if (!_syncRunning) break;

      _syncToken = data.next_batch;
      saveSessionWithSyncToken(_syncToken);

      // Process joined rooms
      _processJoinedRooms(data);

      // Emit a general sync-complete event
      _emit('amino:sync-complete', {
        roomId: '',
        event: { type: 'amino:sync-complete', content: {} },
      });
    } catch (e) {
      if (!_syncRunning) break;
      console.error('[Matrix] Sync error, retrying in 5s:', e);
      await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Stop the sync loop.
 *
 * Ported from matrix.js sync cancellation.
 */
export function stopSync(): void {
  _syncRunning = false;
  if (_syncAbort) {
    _syncAbort.abort();
    _syncAbort = null;
  }
}

/**
 * Check if the sync loop is currently running.
 */
export function isSyncing(): boolean {
  return _syncRunning;
}

/**
 * Get the current sync token.
 */
export function getSyncToken(): string | null {
  return _syncToken;
}

/**
 * Set the sync token (e.g. when restoring from session).
 */
export function setSyncToken(token: string | null): void {
  _syncToken = token;
}

// ============ Room Cache Accessors ============

/**
 * Get list of joined room IDs from the sync cache.
 *
 * Ported from matrix.js `getJoinedRooms()`.
 */
export function getJoinedRoomIds(): string[] {
  return Object.keys(_rooms);
}

/**
 * Get the cached state for a room.
 *
 * Ported from matrix.js `getRoomStateFromCache()`.
 */
export function getRoomStateFromCache(
  roomId: string,
): Record<string, StateEvent> {
  return _rooms[roomId] ? _rooms[roomId].state : {};
}

/**
 * Get all state events of a specific type from the cache.
 *
 * Ported from matrix.js `getStateEventsOfType()`.
 */
export function getStateEventsOfType(
  roomId: string,
  eventType: string,
): StateEvent[] {
  if (!_rooms[roomId]) return [];
  const result: StateEvent[] = [];
  const state = _rooms[roomId].state;
  for (const key of Object.keys(state)) {
    if (key.startsWith(eventType + '|')) {
      result.push(state[key]);
    }
  }
  return result;
}

/**
 * Get a specific cached state event.
 *
 * Ported from matrix.js `getCachedStateEvent()`.
 */
export function getCachedStateEvent(
  roomId: string,
  eventType: string,
  stateKey = '',
): StateEvent | null {
  if (!_rooms[roomId]) return null;
  const key = eventType + '|' + stateKey;
  return _rooms[roomId].state[key] || null;
}

/**
 * Get the room name from cached state.
 *
 * Ported from matrix.js `getRoomName()`.
 */
export function getRoomName(roomId: string): string {
  const nameEvent = getCachedStateEvent(roomId, 'm.room.name', '');
  return nameEvent ? (nameEvent.content.name as string) : roomId;
}

/**
 * Check if a room is a Matrix space.
 *
 * Ported from matrix.js `isSpace()`.
 */
export function isSpace(roomId: string): boolean {
  const createEvent = getCachedStateEvent(roomId, 'm.room.create', '');
  return !!(createEvent?.content?.type === 'm.space');
}

/**
 * Get child room IDs of a space.
 *
 * Ported from matrix.js `getSpaceChildren()`.
 */
export function getSpaceChildren(spaceId: string): string[] {
  return getStateEventsOfType(spaceId, 'm.space.child')
    .filter((e) => e.content && e.content.via)
    .map((e) => e.state_key);
}

/**
 * Reset all sync state. Called on logout.
 */
export function resetSyncState(): void {
  _syncToken = null;
  _syncRunning = false;
  _syncAbort = null;
  // Clear all rooms
  for (const key of Object.keys(_rooms)) {
    delete _rooms[key];
  }
  // Clear all listeners
  for (const key of Object.keys(_listeners)) {
    delete _listeners[key];
  }
}
