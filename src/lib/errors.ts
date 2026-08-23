/**
 * Machine-readable API error. Every failure surfaced to an agent carries an
 * `error` code and a `hint` that says what to do about it.
 */
export class ApiError extends Error {
  /** Marker for ApiError.is — survives bundlers duplicating this module. */
  readonly isApiError = true;
  readonly status: number;
  readonly code: string;
  readonly hint: string;
  readonly details?: Record<string, unknown>;

  /**
   * Structural type guard. Use this instead of `instanceof`: dev bundlers can
   * compile this module into more than one chunk, giving the class two
   * identities, and `instanceof` fails across them.
   */
  static is(err: unknown): err is ApiError {
    return (
      err instanceof ApiError ||
      (typeof err === "object" &&
        err !== null &&
        (err as { isApiError?: unknown }).isApiError === true)
    );
  }

  constructor(
    status: number,
    code: string,
    hint: string,
    details?: Record<string, unknown>,
  ) {
    super(`${code}: ${hint}`);
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.details = details;
  }

  toBody(): Record<string, unknown> {
    return { error: this.code, hint: this.hint, ...(this.details ?? {}) };
  }
}
