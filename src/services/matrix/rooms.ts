// ============================================================================
// Matrix Room Management
// Ported from matrix.js room operations: state events, timeline events,
// room queries, and room name/type detection helpers
// ============================================================================

import type {
  RoomEvent,
  StateEvent,
  RoomMessagesOptions,
  RoomMessagesResponse,
  PowerLevelsContent,
} from './types';
import { request, requestWithRetry } from './client';

// ============ Room Queries (Server) ============

/**
 * Get the list of joined rooms from the homeserver.
 *
 * Ported from matrix.js fallback in `findOrgSpace()`.
 */
export async function getJoinedRooms(): Promise<string[]> {
  const data = await requestWithRetry<{ joined_rooms: string[] }>(
    'GET',
    '/joined_rooms',
  );
  return data.joined_rooms || [];
}

/**
 * Get the full state of a room from the homeserver.
 *
 * Ported from matrix.js `getRoomState()`.
 */
export async function getRoomState(roomId: string): Promise<StateEvent[]> {
  const path = '/rooms/' + encodeURIComponent(roomId) + '/state';
  return requestWithRetry<StateEvent[]>('GET', path);
}

// ============ State Events ============

/**
 * Send a state event to a room.
 *
 * Ported from matrix.js `sendStateEvent()`.
 */
export async function sendStateEvent(
  roomId: string,
  eventType: string,
  stateKey: string,
  content: Record<string, unknown>,
): Promise<{ event_id: string }> {
  const path =
    '/rooms/' +
    encodeURIComponent(roomId) +
    '/state/' +
    encodeURIComponent(eventType) +
    '/' +
    encodeURIComponent(stateKey || '');
  return requestWithRetry<{ event_id: string }>('PUT', path, content);
}

/**
 * Get a specific state event from a room.
 * Returns null if the state event does not exist (404).
 *
 * Ported from matrix.js `getStateEvent()`.
 */
export async function getStateEvent(
  roomId: string,
  eventType: string,
  stateKey = '',
): Promise<Record<string, unknown> | null> {
  const path =
    '/rooms/' +
    encodeURIComponent(roomId) +
    '/state/' +
    encodeURIComponent(eventType) +
    '/' +
    encodeURIComponent(stateKey);
  try {
    return await request<Record<string, unknown>>('GET', path);
  } catch (e: unknown) {
    const matrixErr = e as { httpStatus?: number };
    if (matrixErr.httpStatus === 404) return null;
    throw e;
  }
}

// ============ Timeline Events ============

/**
 * Send a timeline (non-state) event to a room.
 * Generates a unique transaction ID.
 *
 * Ported from matrix.js `sendEvent()`.
 */
export async function sendEvent(
  roomId: string,
  eventType: string,
  content: Record<string, unknown>,
): Promise<{ event_id: string }> {
  const txnId =
    'm' + Date.now() + '.' + Math.random().toString(36).substring(2, 10);
  const path =
    '/rooms/' +
    encodeURIComponent(roomId) +
    '/send/' +
    encodeURIComponent(eventType) +
    '/' +
    encodeURIComponent(txnId);
  return requestWithRetry<{ event_id: string }>('PUT', path, content);
}

/**
 * Get messages from a room's timeline with pagination.
 *
 * Ported from matrix.js `getRoomMessages()`.
 */
export async function getRoomMessages(
  roomId: string,
  opts: RoomMessagesOptions = {},
): Promise<RoomMessagesResponse> {
  const params: Record<string, string> = {
    dir: opts.dir || 'b',
    limit: String(opts.limit || 100),
  };
  if (opts.from) params.from = opts.from;
  if (opts.filter) params.filter = JSON.stringify(opts.filter);

  return requestWithRetry<RoomMessagesResponse>(
    'GET',
    '/rooms/' + encodeURIComponent(roomId) + '/messages',
    null,
    params,
  );
}

// ============ Power Levels ============

/**
 * Get the power levels for a room.
 *
 * Ported from matrix.js `getRoomPowerLevels()`.
 */
export async function getRoomPowerLevels(
  roomId: string,
): Promise<PowerLevelsContent> {
  return requestWithRetry<PowerLevelsContent>(
    'GET',
    '/rooms/' +
      encodeURIComponent(roomId) +
      '/state/m.room.power_levels/',
  );
}

/**
 * Set a specific user's power level in a room.
 *
 * Ported from matrix.js `setUserPowerLevel()`.
 */
export async function setUserPowerLevel(
  roomId: string,
  userId: string,
  level: number,
): Promise<void> {
  const current = await getRoomPowerLevels(roomId);
  if (!current.users) current.users = {};
  current.users[userId] = level;
  await sendStateEvent(
    roomId,
    'm.room.power_levels',
    '',
    current as unknown as Record<string, unknown>,
  );
}

// ============ Room Member Listing ============

export interface RoomMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Get members of a room, filtered by membership type.
 *
 * Ported from matrix.js `getRoomMembers()`.
 */
export async function getRoomMembers(
  roomId: string,
  memberships: string[] = ['join'],
): Promise<RoomMember[]> {
  const allowedMemberships = new Set(memberships);
  const path = '/rooms/' + encodeURIComponent(roomId) + '/members';
  const data = await requestWithRetry<{ chunk: RoomEvent[] }>('GET', path);

  return (data.chunk || [])
    .filter(
      (e) =>
        e.content &&
        allowedMemberships.has(e.content.membership as string),
    )
    .map((e) => ({
      userId: e.state_key || '',
      displayName:
        (e.content.displayname as string) || e.state_key || '',
      avatarUrl: (e.content.avatar_url as string) || null,
    }));
}

// ============ Room Name/Type Helpers ============

/**
 * Get room type from the law.firm.room.type state event.
 * Returns 'matter', 'portal', or null.
 */
export async function getRoomType(
  roomId: string,
): Promise<string | null> {
  const content = await getStateEvent(roomId, 'law.firm.room.type', '');
  if (content && typeof content.type === 'string') {
    return content.type;
  }
  return null;
}

/**
 * Check if a room is a matter room.
 */
export async function isMatterRoom(roomId: string): Promise<boolean> {
  return (await getRoomType(roomId)) === 'matter';
}

/**
 * Check if a room is a portal room.
 */
export async function isPortalRoom(roomId: string): Promise<boolean> {
  return (await getRoomType(roomId)) === 'portal';
}
