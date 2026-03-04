// ============================================================================
// Matrix Types & Constants
// Ported from matrix.js — custom event types, power levels, and interfaces
// ============================================================================

/** Custom Matrix event types used by Amino */
export const EVENT_TYPES = {
  ORG_CONFIG: 'law.firm.org.config',
  ORG_MEMBER: 'law.firm.org.member',
  SCHEMA_TABLE: 'law.firm.schema.table',
  SCHEMA_FIELD: 'law.firm.schema.field',
  SCHEMA_OBJECT: 'law.firm.schema.object',
  VAULT_METADATA: 'law.firm.vault.metadata',
  RECORD: 'law.firm.record',
  RECORD_MUTATE: 'law.firm.record.mutate',
  RECORD_CREATE: 'law.firm.record.create',
  RECORD_UPDATE: 'law.firm.record.update',
  RECORD_DELETE: 'law.firm.record.delete',
  VIEW: 'law.firm.view',
  VIEW_SHARE: 'law.firm.view.share',
  VIEW_DELETE: 'law.firm.view.delete',
  USER_PREFERENCES: 'law.firm.user.preferences',
  INTERFACE: 'law.firm.interface',
  CLIENT_MESSAGE: 'law.firm.client.message',
  NOTE_INTERNAL: 'law.firm.note.internal',
  MIGRATION_HISTORY: 'law.firm.migration.history',
  BRIDGE_CONFIG: 'law.firm.bridge.config',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Power level thresholds */
export const POWER_LEVELS = {
  ADMIN: 100,
  STAFF: 50,
  CLIENT: 10,
  DEFAULT: 0,
} as const;

export type PowerLevel = (typeof POWER_LEVELS)[keyof typeof POWER_LEVELS];

/** Users that are always treated as admins regardless of room power levels */
export const ADMIN_USERNAMES = ['admin'] as const;

// ============================================================================
// Session & Auth Interfaces
// ============================================================================

export interface MatrixSession {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
  syncToken: string | null;
}

export interface MatrixLoginResponse {
  access_token: string;
  user_id: string;
  device_id: string;
  home_server?: string;
  well_known?: Record<string, unknown>;
}

export interface LoginCredentials {
  userId: string;
  deviceId: string;
  accessToken: string;
}

// ============================================================================
// Sync Interfaces
// ============================================================================

export interface SyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, JoinedRoom>;
    invite?: Record<string, InvitedRoom>;
    leave?: Record<string, LeftRoom>;
  };
  account_data?: {
    events?: RoomEvent[];
  };
}

export interface JoinedRoom {
  state?: { events?: StateEvent[] };
  timeline?: { events?: RoomEvent[]; limited?: boolean; prev_batch?: string };
  account_data?: { events?: RoomEvent[] };
  ephemeral?: { events?: RoomEvent[] };
}

export interface InvitedRoom {
  invite_state?: { events?: StateEvent[] };
}

export interface LeftRoom {
  state?: { events?: StateEvent[] };
  timeline?: { events?: RoomEvent[] };
}

// ============================================================================
// Event Interfaces
// ============================================================================

export interface RoomEvent {
  type: string;
  content: Record<string, unknown>;
  event_id?: string;
  sender?: string;
  origin_server_ts?: number;
  unsigned?: Record<string, unknown>;
  room_id?: string;
  state_key?: string;
}

export interface StateEvent extends RoomEvent {
  state_key: string;
  prev_content?: Record<string, unknown>;
}

// ============================================================================
// Room Interfaces
// ============================================================================

export interface RoomMessagesResponse {
  chunk: RoomEvent[];
  start?: string;
  end?: string;
  state?: StateEvent[];
}

export interface RoomMessagesOptions {
  dir?: 'b' | 'f';
  limit?: number;
  from?: string;
  filter?: Record<string, unknown>;
}

export interface CreateRoomOptions {
  name: string;
  topic?: string;
  preset?: 'private_chat' | 'public_chat' | 'trusted_private_chat';
  initialState?: StateEvent[];
  creationContent?: Record<string, unknown>;
  invite?: string[];
}

// ============================================================================
// Error Interfaces
// ============================================================================

export interface MatrixError extends Error {
  errcode?: string;
  httpStatus?: number;
  retryAfterMs?: number;
}

// ============================================================================
// Power Level Interfaces
// ============================================================================

export interface PowerLevelsContent {
  users?: Record<string, number>;
  users_default?: number;
  events?: Record<string, number>;
  events_default?: number;
  state_default?: number;
  ban?: number;
  kick?: number;
  invite?: number;
  redact?: number;
}

export interface PowerLevelConfig {
  users?: Record<string, number>;
  usersDefault?: number;
  events?: Record<string, number>;
  eventsDefault?: number;
  stateDefault?: number;
}

// ============================================================================
// Callback Types
// ============================================================================

export type EventCallback = (data: SyncEventData) => void;

export interface SyncEventData {
  roomId: string;
  event: RoomEvent | StateEvent;
}

/** Storage keys */
export const CONFIG_KEY = 'matrix_config';
export const SESSION_KEY = 'matrix_session';
