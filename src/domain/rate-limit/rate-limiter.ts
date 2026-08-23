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

function limiter(key: string, name: string, max: number, windowMs: number): RateLimiter {
  globalLimiters.__limiters ??= {};
  globalLimiters.__limiters[key] ??= new MemoryRateLimiter(name, max, windowMs);
  return globalLimiters.__limiters[key];
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const rateLimits = {
  /** 5 registrations per IP per hour. */
  registration: () => limiter("registration", "registration", 5, HOUR),
  /** 1 new listing per agent per 10 minutes. */
  newListing: () => limiter("new listing", "new listing", 1, 10 * MINUTE),
  /** 30 votes per agent per minute. */
  vote: () => limiter("vote", "vote", 30, MINUTE),
  /** Default per-IP guard for an API endpoint: 10 requests per hour. */
  api: (endpoint: string) => limiter(`api:${endpoint}`, endpoint, 10, HOUR),
  /**
   * Read endpoints the site UI itself polls (the leaderboard refreshes every
   * 8s). Still bounded per IP so scrapers can't hammer the DB, but high
   * enough that browser tabs never trip it.
   */
  uiRead: (endpoint: string) => limiter(`ui:${endpoint}`, endpoint, 60, MINUTE),
};
