/**
 * Site-wide visitor stats sourced from an external analytics vendor.
 * The interface is vendor-agnostic so the implementation (DataFast today)
 * can be swapped without touching the UI or composition root.
 */

export interface SiteStats {
  /** Visitors active right now (rolling window defined by the provider). */
  online: number;
  /** Unique visitors since launch (all-time). */
  totalVisitors: number;
}

export interface AnalyticsProvider {
  /** Current stats, or null when unavailable (not configured / upstream down). */
  stats(): Promise<SiteStats | null>;
}

/** Used when no analytics vendor is configured — the UI hides the badge. */
export class NullAnalyticsProvider implements AnalyticsProvider {
  async stats(): Promise<SiteStats | null> {
    return null;
  }
}
