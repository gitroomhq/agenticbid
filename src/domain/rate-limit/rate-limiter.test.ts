import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRateLimiter } from "./rate-limiter";
import { ApiError } from "@/lib/errors";

describe("MemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max requests in a window, then throws 429", async () => {
    const limiter = new MemoryRateLimiter("test", 10, 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) await limiter.consume("1.2.3.4");
    await expect(limiter.consume("1.2.3.4")).rejects.toMatchObject({ status: 429 });
  });

  it("tracks each key independently", async () => {
    const limiter = new MemoryRateLimiter("test", 1, 60 * 60 * 1000);
    await limiter.consume("1.2.3.4");
    await expect(limiter.consume("5.6.7.8")).resolves.toBeUndefined();
  });

  it("frees the slot after the window passes", async () => {
    const limiter = new MemoryRateLimiter("test", 1, 60 * 60 * 1000);
    await limiter.consume("1.2.3.4");
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    await expect(limiter.consume("1.2.3.4")).resolves.toBeUndefined();
  });

  it("reports retry-after in the error details", async () => {
    const limiter = new MemoryRateLimiter("test", 1, 60 * 60 * 1000);
    await limiter.consume("1.2.3.4");
    vi.advanceTimersByTime(30 * 60 * 1000);
    try {
      await limiter.consume("1.2.3.4");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).details).toMatchObject({ retryAfterSeconds: 1800 });
    }
  });
});
