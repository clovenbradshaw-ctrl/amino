// ============================================================================
// Matrix HTTP Transport Layer
// Ported from matrix.js _request() and _requestWithRetry()
// Handles access token injection, JSON parsing, error codes
// ============================================================================

import type { MatrixError } from './types';
import { rateLimiter } from './rate-limiter';

/** Hardcoded homeserver URL */
const HOMESERVER_URL = 'https://app.aminoimmigration.com';

/** Matrix CS API base path */
const API_PREFIX = '/_matrix/client/v3';

/** Internal state for access token — managed by auth module */
let _accessToken: string | null = null;

/**
 * Set the access token used for authenticated requests.
 * Called by the auth module after login/restore.
 */
export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

/**
 * Get the current access token.
 */
export function getAccessToken(): string | null {
  return _accessToken;
}

/**
 * Get the homeserver URL.
 */
export function getHomeserverUrl(): string {
  return HOMESERVER_URL;
}

/**
 * Low-level Matrix API request. Builds the URL, injects auth headers,
 * parses JSON, and throws typed errors.
 *
 * Ported from matrix.js `_request()`.
 */
export async function request<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, unknown> | null,
  queryParams?: Record<string, string>,
): Promise<T> {
  let url = HOMESERVER_URL + API_PREFIX + path;

  if (queryParams) {
    const params = new URLSearchParams(queryParams);
    url += '?' + params.toString();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (_accessToken) {
    headers['Authorization'] = 'Bearer ' + _accessToken;
  }

  const opts: RequestInit = { method, headers };
  if (body !== undefined && body !== null) {
    opts.body = JSON.stringify(body);
  }

  const response = await fetch(url, opts);

  // Check for non-JSON responses (e.g. HTML error pages from reverse proxies)
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.includes('application/json')) {
    let preview = '';
    try {
      preview = (await response.text()).substring(0, 120);
    } catch (_e) {
      // ignore
    }

    const err = new Error(
      'Matrix API returned non-JSON response for ' +
        path +
        ' (HTTP ' +
        response.status +
        ', content-type: ' +
        contentType +
        ').' +
        (preview.indexOf('<html') !== -1 || preview.indexOf('<!DOCTYPE') !== -1
          ? ' The homeserver may be down or the URL may be incorrect.'
          : ''),
    ) as MatrixError;
    err.httpStatus = response.status;
    throw err;
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (_parseErr) {
    const err = new Error(
      'Invalid JSON from Matrix API for ' +
        path +
        ' (HTTP ' +
        response.status +
        '). The homeserver may be misconfigured.',
    ) as MatrixError;
    err.httpStatus = response.status;
    throw err;
  }

  if (!response.ok) {
    const errorData = data as unknown as {
      error?: string;
      errcode?: string;
      retry_after_ms?: number;
    };
    const err = new Error(
      errorData.error || 'Matrix API error',
    ) as MatrixError;
    err.errcode = errorData.errcode;
    err.httpStatus = response.status;
    if (errorData.retry_after_ms !== undefined) {
      err.retryAfterMs = errorData.retry_after_ms;
    }
    throw err;
  }

  return data;
}

/**
 * Matrix API request with retry logic and rate-limit queue.
 * Serializes requests through the rate limiter to avoid bursts.
 *
 * Ported from matrix.js `_requestWithRetry()`.
 *
 * @param method - HTTP method
 * @param path - API path (without base URL or API prefix)
 * @param body - Request body (will be JSON-serialized)
 * @param queryParams - URL query parameters
 * @param retries - Maximum retry attempts (default: 5)
 * @param priority - If true, bypasses the queue (used for auth)
 */
export async function requestWithRetry<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, unknown> | null,
  queryParams?: Record<string, string>,
  retries = 5,
  priority = false,
): Promise<T> {
  return rateLimiter.enqueueWithRetry(
    () => request<T>(method, path, body, queryParams),
    retries,
    priority,
  );
}
