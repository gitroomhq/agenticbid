import { logger } from "@/lib/logger";
import type { AnalyticsProvider, SiteStats } from "@/domain/analytics/analytics-provider";

interface DatafastEnvelope {
  status: string;
  data?: Array<{ visitors?: number }>;
}

export interface DatafastOptions {
  /**
   * Which site to read stats for — DataFast access tokens (dft_...) span the
   * whole account, so every call must name the site. Find the id via
   * GET /api/v1/admin/websites (it is NOT the dfid_... tracking id).
   */
  websiteId: string;
  baseUrl?: string;
  cacheTtlMs?: number;
}

/**
 * DataFast (datafa.st) implementation of {@link AnalyticsProvider}.
 *
 * "online" comes from the realtime endpoint (active visitors in the last
 * ~10 minutes); "totalVisitors" from the all-time overview. Results are
 * cached in-memory so a busy homepage doesn't hammer the DataFast API,
 * and the last good value is served if an upstream call fails.
 */
export class DatafastAnalyticsProvider implements AnalyticsProvider {
  private cached: SiteStats | null = null;
  private fetchedAt = 0;
  private inflight: Promise<SiteStats | null> | null = null;

  private readonly websiteId: string;
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;

  constructor(
    private readonly apiKey: string,
    options: DatafastOptions,
  ) {
    this.websiteId = options.websiteId;
    this.baseUrl = options.baseUrl ?? "https://datafa.st/api/v1";
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
  }

  async stats(): Promise<SiteStats | null> {
    const fresh = this.cached && Date.now() - this.fetchedAt < this.cacheTtlMs;
    if (fresh) return this.cached;
    // Collapse concurrent renders into a single upstream refresh.
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(): Promise<SiteStats | null> {
    try {
      const [online, totalVisitors] = await Promise.all([
        this.visitorCount("/analytics/realtime?fields=visitors"),
        this.visitorCount("/analytics/overview?fields=visitors"),
      ]);
      this.cached = { online, totalVisitors };
      this.fetchedAt = Date.now();
    } catch (error) {
      logger.warn("datafast_stats_failed", { error: String(error) });
      // Keep serving the stale value (or null) rather than breaking the page,
      // but back off before retrying upstream.
      this.fetchedAt = Date.now();
    }
    return this.cached;
  }

  private async visitorCount(path: string): Promise<number> {
    const websiteId = `&websiteId=${encodeURIComponent(this.websiteId)}`;
    const res = await fetch(`${this.baseUrl}${path}${websiteId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`datafast ${path} responded ${res.status}`);
    const body = (await res.json()) as DatafastEnvelope;
    const visitors = body.data?.[0]?.visitors;
    if (typeof visitors !== "number") {
      throw new Error(`datafast ${path} returned no visitors field`);
    }
    return visitors;
  }
}
