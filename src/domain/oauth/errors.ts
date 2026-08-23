/**
 * OAuth-shaped errors. Both carry structural markers and `is()` guards
 * instead of relying on `instanceof` — dev bundlers can duplicate this module
 * across chunks, giving the classes two identities.
 */

/** Error during the authorization request (the /oauth/authorize screen). */
export class OAuthRequestError extends Error {
  readonly isOAuthRequestError = true;

  constructor(
    readonly error: string,
    readonly description: string,
    /** Present when RFC 6749 says the error must be returned via redirect. */
    readonly redirect?: { uri: string; state?: string },
  ) {
    super(`${error}: ${description}`);
  }

  static is(err: unknown): err is OAuthRequestError {
    return (
      err instanceof OAuthRequestError ||
      (typeof err === "object" &&
        err !== null &&
        (err as { isOAuthRequestError?: unknown }).isOAuthRequestError === true)
    );
  }

  /** Redirect target carrying the error, when the request allows one. */
  redirectUrl(): URL | null {
    if (!this.redirect) return null;
    const url = new URL(this.redirect.uri);
    url.searchParams.set("error", this.error);
    url.searchParams.set("error_description", this.description);
    if (this.redirect.state) url.searchParams.set("state", this.redirect.state);
    return url;
  }
}

/** Error at the /oauth/token endpoint, rendered as an RFC 6749 error body. */
export class OAuthTokenError extends Error {
  readonly isOAuthTokenError = true;

  constructor(
    readonly status: number,
    readonly error: string,
    readonly description: string,
  ) {
    super(`${error}: ${description}`);
  }

  static is(err: unknown): err is OAuthTokenError {
    return (
      err instanceof OAuthTokenError ||
      (typeof err === "object" &&
        err !== null &&
        (err as { isOAuthTokenError?: unknown }).isOAuthTokenError === true)
    );
  }

  toBody(): Record<string, string> {
    return { error: this.error, error_description: this.description };
  }
}
