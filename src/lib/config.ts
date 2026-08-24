/**
 * Typed application configuration, read once from the environment.
 * Everything environment-derived is resolved here so the rest of the app
 * never touches process.env directly.
 */

export interface AppConfig {
  appBaseUrl: string;
  /**
   * Secret behind sealed OAuth client ids, auth codes, and similar opaque
   * tokens. Set APP_SECRET in production; the DATABASE_URL fallback keeps dev
   * tokens stable across restarts without extra setup.
   */
  appSecret: string;
  /**
   * DataFast access token (dft_...). Both this and datafastWebsiteId must be
   * set for the live visitor badge; otherwise it's hidden — analytics is
   * optional in every environment.
   */
  datafastApiKey: string | null;
  /** DataFast website id, from GET /api/v1/admin/websites (not the dfid_... tracking id). */
  datafastWebsiteId: string | null;
  /** Optional public stats page linked from the badge ("see stats →"). */
  datafastStatsUrl: string | null;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  // Dev: re-read every call so `next dev` env reloads take effect without a
  // restart. Prod: read once.
  if (process.env.NODE_ENV !== "production") cached = null;
  cached ??= {
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
    appSecret:
      process.env.APP_SECRET ??
      process.env.DATABASE_URL ??
      "voting-dev-insecure-secret",
    datafastApiKey: process.env.DATAFAST_API_KEY ?? null,
    datafastWebsiteId: process.env.DATAFAST_WEBSITE_ID ?? null,
    datafastStatsUrl: process.env.DATAFAST_STATS_URL ?? null,
  };
  return cached;
}
