import { ApiError } from "@/lib/errors";

/**
 * Generic rate limiter contract. The in-memory implementation below is
 * per-process; swap in a Redis-backed implementation behind the same
 * interface when running multiple instances.
 */
export interface RateLimiter {
  /**
   * Consume one unit for `key`; throws ApiError(429) when the window is full.
   */
  consume(key: string): Promise<void>;
}

interface WindowState {
  timestamps: number[];
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowState>();

  /**
   * @param name - Human name used in error hints (e.g. "registration")
   * @param max - Allowed events per window
   * @param windowMs - Window length in milliseconds
   */
  constructor(
    private readonly name: string,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<void> {
    const now = Date.now();
    const state = this.windows.get(key) ?? { timestamps: [] };
    state.timestamps = state.timestamps.filter((ts) => now - ts < this.windowMs);
    if (state.timestamps.length >= this.max) {
      const retryAfterSec = Math.ceil(
        (this.windowMs - (now - state.timestamps[0])) / 1000,
      );
      throw new ApiError(
        429,
        "rate_limited",
        `Too many ${this.name} requests. Retry in ~${retryAfterSec}s.`,
        { retryAfterSeconds: retryAfterSec },
      );
    }
    state.timestamps.push(now);
    this.windows.set(key, state);
    // opportunistic cleanup so the map doesn't grow unbounded
    if (this.windows.size > 10_000) {
      for (const [k, s] of this.windows) {
        if (s.timestamps.every((ts) => now - ts >= this.windowMs)) this.windows.delete(k);
      }
    }
  }
}

/** Shared limiter instances (per process). */
const globalLimiters = globalThis as unknown as {
  __limiters?: Record<string, RateLimiter>;
};

function limiter(name: string, max: number, windowMs: number): RateLimiter {
  globalLimiters.__limiters ??= {};
  globalLimiters.__limiters[name] ??= new MemoryRateLimiter(name, max, windowMs);
  return globalLimiters.__limiters[name];
}

export const rateLimits = {
  /** 5 registrations per IP per hour. */
  registration: () => limiter("registration", 5, 60 * 60 * 1000),
  /** 1 new listing per agent per 10 minutes. */
  newListing: () => limiter("new listing", 1, 10 * 60 * 1000),
  /** 20 bid attempts per agent per minute (402 retries included). */
  bidAttempt: () => limiter("bid", 20, 60 * 1000),
};
