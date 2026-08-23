import { clientIp } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { OAuthTokenError } from "@/domain/oauth/errors";
import { firstString } from "@/app/oauth/authorize/params";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
};

export async function POST(request: Request): Promise<Response> {
  try {
    await rateLimits.uiRead("oauth").consume(clientIp(request));
    const form = await request.formData();
    const params = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, firstString(value)]),
    );
    const token = getServices().oauth.exchange(params);
    return Response.json(token, {
      headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (OAuthTokenError.is(err)) {
      return Response.json(err.toBody(), { status: err.status, headers: CORS_HEADERS });
    }
    if (ApiError.is(err)) {
      return Response.json(
        { error: "invalid_request", error_description: err.hint },
        { status: err.status, headers: CORS_HEADERS },
      );
    }
    throw err;
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
