import { getServices } from "@/lib/services";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
};

/** RFC 8414 authorization server metadata. */
export async function GET(): Promise<Response> {
  return Response.json(getServices().oauth.metadata(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
