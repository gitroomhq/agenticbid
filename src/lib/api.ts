import { NextResponse } from "next/server";
import { ZodType } from "zod";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { RateLimiter } from "@/domain/rate-limit/rate-limiter";

/** Best-effort client IP for rate limiting. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Wrap a route handler with a per-client-IP rate limit. Compose inside
 * withErrorHandling so the thrown 429 becomes consistent JSON:
 * `withErrorHandling(withRateLimit(limiter, handler))`.
 */
export function withRateLimit<Rest extends unknown[]>(
  limiter: RateLimiter,
  handler: (request: Request, ...rest: Rest) => Promise<NextResponse>,
): (request: Request, ...rest: Rest) => Promise<NextResponse> {
  return async (request: Request, ...rest: Rest) => {
    await limiter.consume(clientIp(request));
    return handler(request, ...rest);
  };
}

/** JSON response helper with consistent shape. */
export function jsonOk(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

export function jsonError(error: ApiError): NextResponse {
  return NextResponse.json(error.toBody(), { status: error.status });
}

/**
 * Wrap a route handler so thrown ApiErrors become consistent
 * `{error, hint}` JSON and unexpected errors become opaque 500s.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err);
      logger.error("unhandled_error", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return jsonError(
        new ApiError(500, "internal_error", "Something went wrong on our side. Try again."),
      );
    }
  };
}

/** Parse a request JSON body against a zod schema, throwing ApiError on failure. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(
      400,
      "invalid_body",
      `${first.path.join(".") || "body"}: ${first.message}`,
    );
  }
  return result.data;
}
