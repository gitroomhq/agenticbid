import { afterEach, describe, expect, it, vi } from "vitest";
import { DatafastAnalyticsProvider } from "@/domain/analytics/datafast-provider";

function okResponse(visitors: number) {
  return {
    ok: true,
    json: async () => ({ status: "success", data: [{ visitors }] }),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DatafastAnalyticsProvider", () => {
  it("combines realtime and all-time visitor counts", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/analytics/realtime")
        ? okResponse(42)
        : okResponse(1_279_288),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DatafastAnalyticsProvider("dft_test", {
      websiteId: "site_1",
    });
    await expect(provider.stats()).resolves.toEqual({
      online: 42,
      totalVisitors: 1_279_288,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toContain("websiteId=site_1");
    }
  });

  it("serves the cached value inside the TTL", async () => {
    const fetchMock = vi.fn(async () => okResponse(7));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DatafastAnalyticsProvider("dft_test", { websiteId: "site_1" });
    await provider.stats();
    await provider.stats();
    expect(fetchMock).toHaveBeenCalledTimes(2); // one refresh = two endpoints
  });

  it("keeps the last good value when the upstream fails", async () => {
    vi.useFakeTimers();
    let fail = false;
    const fetchMock = vi.fn(async () =>
      fail ? ({ ok: false, status: 503 } as Response) : okResponse(5),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DatafastAnalyticsProvider("dft_test", {
      websiteId: "site_1",
      cacheTtlMs: 1_000,
    });
    await expect(provider.stats()).resolves.toEqual({
      online: 5,
      totalVisitors: 5,
    });

    fail = true;
    vi.advanceTimersByTime(2_000); // expire the cache, next refresh fails
    await expect(provider.stats()).resolves.toEqual({
      online: 5,
      totalVisitors: 5,
    });
  });

  it("returns null when it never succeeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    const provider = new DatafastAnalyticsProvider("dft_test", { websiteId: "site_1" });
    await expect(provider.stats()).resolves.toBeNull();
  });
});
