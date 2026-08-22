/**
 * Machine-readable API error. Every failure surfaced to an agent carries an
 * `error` code and a `hint` that says what to do about it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string;
  readonly details?: Record<string, unknown>;

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
