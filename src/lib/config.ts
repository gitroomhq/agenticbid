/**
 * Typed application configuration, read once from the environment.
 * Everything environment-derived is resolved here so the rest of the app
 * never touches process.env directly.
 */

export interface AppConfig {
  appBaseUrl: string;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  cached ??= {
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  };
  return cached;
}
