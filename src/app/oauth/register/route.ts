import { clientIp } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { OAuthTokenError } from "@/domain/oauth/errors";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
};

/** RFC 7591 dynamic client registration — stateless, nothing stored. */
export async function POST(request: Request): Promise<Response> {
  try {
    await rateLimits.uiRead("oauth").consume(clientIp(request));
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OAuthTokenError(400, "invalid_client_metadata", "Body must be valid JSON.");
    }
    const client = getServices().oauth.registerClient(body);
    return Response.json(client, { status: 201, headers: CORS_HEADERS });
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
