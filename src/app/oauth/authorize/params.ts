/** OAuth params carried from the authorize URL through the consent form. */
export const OAUTH_PARAM_KEYS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "state",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "resource",
] as const;

/** First-string normalization for searchParams / FormData values. */
export function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}
