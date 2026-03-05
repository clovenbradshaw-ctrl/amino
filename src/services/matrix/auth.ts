// ============================================================================
// Matrix Authentication Module
// Ported from matrix.js login/logout/session management
// Homeserver hardcoded to https://app.aminoimmigration.com
// ============================================================================

import type {
  MatrixLoginResponse,
  MatrixSession,
  LoginCredentials,
} from './types';
import { SESSION_KEY } from './types';
import { request, setAccessToken, getAccessToken } from './client';
import { rateLimiter } from './rate-limiter';

// ============ Internal State ============

let _userId: string | null = null;
let _deviceId: string | null = null;

// ============ Session Persistence ============

/**
 * Save the current session to sessionStorage.
 * Ported from matrix.js `_saveSession()`.
 */
function _saveSession(syncToken: string | null = null): void {
  try {
    const session: MatrixSession = {
      homeserverUrl: 'https://app.aminoimmigration.com',
      accessToken: getStoredAccessToken() || '',
      userId: _userId || '',
      deviceId: _deviceId || '',
      syncToken,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[Matrix] Could not save session:', e);
  }
}

/**
 * Clear the session from sessionStorage.
 */
function _clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Helper to get the access token from the client module.
 */
function getStoredAccessToken(): string | null {
  return getAccessToken();
}

// ============ Public API ============

/**
 * Login with username and password.
 * Calls `/_matrix/client/v3/login` with `m.login.password`.
 *
 * Ported from matrix.js `login()`.
 */
export async function login(
  username: string,
  password: string,
): Promise<LoginCredentials> {
  const body = {
    type: 'm.login.password',
    identifier: {
      type: 'm.id.user',
      user: username,
    },
    password,
    initial_device_display_name: 'Amino React',
  };

  // Login is a priority request — bypasses the rate limiter queue
  const data = await request<MatrixLoginResponse>('POST', '/login', body);

  const accessToken = data.access_token;
  _userId = data.user_id;
  _deviceId = data.device_id;

  // Set the access token on the HTTP client
  setAccessToken(accessToken);

  // Persist session
  _saveSession(null);

  return {
    userId: _userId,
    deviceId: _deviceId,
    accessToken,
  };
}

/**
 * Logout the current session.
 * Calls `/_matrix/client/v3/logout` and clears all local state.
 *
 * Ported from matrix.js `logout()`.
 */
export async function logout(): Promise<void> {
  if (getStoredAccessToken()) {
    try {
      await request('POST', '/logout');
    } catch (_e) {
      // Ignore logout errors — the server may be unreachable
    }
  }

  setAccessToken(null);
  _userId = null;
  _deviceId = null;
  _clearSession();
  rateLimiter.reset();
}

/**
 * Restore a previously saved session from sessionStorage.
 * Returns true if a valid session was found and restored.
 *
 * Ported from matrix.js `restoreSession()`.
 */
export function restoreSession(): MatrixSession | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    const session: MatrixSession = JSON.parse(stored);
    if (session.accessToken && session.homeserverUrl && session.userId) {
      setAccessToken(session.accessToken);
      _userId = session.userId;
      _deviceId = session.deviceId;
      return session;
    }
  } catch (e) {
    console.warn('[Matrix] Could not restore session:', e);
  }
  return null;
}

/**
 * Manually set session credentials (e.g. from an external source).
 *
 * Ported from matrix.js `setSession()`.
 */
export function setSession(
  accessToken: string,
  userId: string,
  deviceId: string,
): void {
  setAccessToken(accessToken);
  _userId = userId;
  _deviceId = deviceId;
  _saveSession(null);
}

/**
 * Save the current session with an updated sync token.
 */
export function saveSessionWithSyncToken(syncToken: string | null): void {
  _saveSession(syncToken);
}

/**
 * Clear the saved session.
 */
export function clearSession(): void {
  _clearSession();
}

/**
 * Check if the user is currently logged in.
 */
export function isLoggedIn(): boolean {
  return !!getStoredAccessToken();
}

/**
 * Get the current user's Matrix ID.
 */
export function getUserId(): string | null {
  return _userId;
}

/**
 * Get the current device ID.
 */
export function getDeviceId(): string | null {
  return _deviceId;
}

/**
 * Check if a saved session exists (for offline detection).
 *
 * Ported from matrix.js `hasSavedSession()`.
 */
export function hasSavedSession(): boolean {
  try {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) {
      const parsed: MatrixSession = JSON.parse(session);
      return !!(parsed.userId && parsed.homeserverUrl);
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Get the saved userId without restoring the full session.
 *
 * Ported from matrix.js `getSavedUserId()`.
 */
export function getSavedUserId(): string | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed: MatrixSession = JSON.parse(stored);
      return parsed.userId || null;
    }
  } catch (_e) {
    // ignore
  }
  return null;
}
