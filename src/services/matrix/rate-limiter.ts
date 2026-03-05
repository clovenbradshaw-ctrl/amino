// ============================================================================
// Matrix Rate Limiter
// Serial request queue with 429 backoff handling
// Ported from matrix.js _requestQueue / _rateLimitUntil logic
// ============================================================================

export interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  priority: boolean;
}

/**
 * Rate limiter that serializes Matrix API requests to avoid overwhelming
 * the homeserver. Handles HTTP 429 responses with exponential backoff.
 *
 * Auth requests (login) can bypass the queue via the priority flag.
 */
export class RateLimiter {
  /** Timestamp: no requests should be sent before this time */
  private _rateLimitUntil = 0;

  /** Serialized request chain -- ensures only one request is in-flight at a time */
  private _requestQueue: Promise<void> = Promise.resolve();

  /**
   * Set a global rate-limit cooldown. All queued requests will wait until
   * this timestamp before proceeding.
   */
  setRateLimitUntil(timestamp: number): void {
    this._rateLimitUntil = timestamp;
  }

  /**
   * Get the current rate-limit cooldown timestamp.
   */
  getRateLimitUntil(): number {
    return this._rateLimitUntil;
  }

  /**
   * Wait for any active rate-limit cooldown period.
   */
  async waitForCooldown(): Promise<void> {
    const waitMs = this._rateLimitUntil - Date.now();
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Enqueue a request to be executed serially. Returns a promise that
   * resolves with the request result once it completes.
   *
   * If `priority` is true, the request is executed immediately without
   * waiting for the queue (used for auth requests like login).
   */
  enqueue<T>(
    execute: () => Promise<T>,
    priority = false,
  ): Promise<T> {
    if (priority) {
      // Priority requests (e.g. login) bypass the queue entirely
      return execute();
    }

    return new Promise<T>((resolve, reject) => {
      this._requestQueue = this._requestQueue.then(async () => {
        try {
          // Wait for any global rate-limit cooldown before sending
          await this.waitForCooldown();
          const result = await execute();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Execute a request with retry logic. Retries on 5xx errors, network
   * failures, and 429 rate limits with exponential backoff.
   *
   * @param execute - Function that performs the actual HTTP request
   * @param retries - Maximum number of retry attempts (default: 5)
   * @param priority - Whether this is a priority request that bypasses the queue
   */
  enqueueWithRetry<T>(
    execute: () => Promise<T>,
    retries = 5,
    priority = false,
  ): Promise<T> {
    const self = this;

    const executeWithRetry = async (): Promise<T> => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= retries; attempt++) {
        // Wait for any global rate-limit cooldown before sending
        await self.waitForCooldown();

        try {
          return await execute();
        } catch (err: unknown) {
          lastError = err;

          const matrixErr = err as {
            httpStatus?: number;
            retryAfterMs?: number;
          };

          const isRetryable =
            !matrixErr.httpStatus ||
            matrixErr.httpStatus >= 500 ||
            matrixErr.httpStatus === 429;

          if (attempt < retries && isRetryable) {
            const delay =
              matrixErr.retryAfterMs || Math.pow(2, attempt) * 1000;

            // On 429, set global cooldown so queued requests also wait
            if (matrixErr.httpStatus === 429) {
              self._rateLimitUntil = Date.now() + delay;
            }

            await new Promise<void>((resolve) => setTimeout(resolve, delay));
          } else {
            throw err;
          }
        }
      }

      // Should not reach here, but TypeScript needs it
      throw lastError;
    };

    if (priority) {
      return executeWithRetry();
    }

    return new Promise<T>((resolve, reject) => {
      this._requestQueue = this._requestQueue.then(async () => {
        try {
          const result = await executeWithRetry();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Reset the rate limiter state. Useful on logout.
   */
  reset(): void {
    this._rateLimitUntil = 0;
    this._requestQueue = Promise.resolve();
  }
}

/** Singleton rate limiter instance */
export const rateLimiter = new RateLimiter();
