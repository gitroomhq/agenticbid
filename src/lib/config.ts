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
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  cached ??= {
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
    appSecret:
      process.env.APP_SECRET ??
      process.env.DATABASE_URL ??
      "voting-dev-insecure-secret",
  };
  return cached;
}
