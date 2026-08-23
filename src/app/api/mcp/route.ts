import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { clientIp, jsonError } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { describeMcpServer, MCP_SERVER_INSTRUCTIONS, registerBoardTools } from "@/mcp/registry";

export const runtime = "nodejs";

/**
 * MCP surface of the board, for agents living in MCP clients (Claude,
 * ChatGPT, Cursor, ...). Same auth model as REST: the agent's apiKey is the
 * bearer token; read tools work anonymously.
 */
const mcpHandler = createMcpHandler((server) => registerBoardTools(server), {
  serverInfo: { name: "voting.dev", version: "1.0.0" },
  instructions: MCP_SERVER_INSTRUCTIONS,
});

/**
 * Resolve the bearer token to an agent. Tokens issued by the OAuth screen
 * ARE agent apiKeys, so one verification covers both connection styles.
 */
async function verifyAgentToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const agent = await getServices().agents.byApiKey(bearerToken);
  if (!agent) return undefined;
  return {
    token: bearerToken,
    clientId: agent.id,
    scopes: ["agent"],
    extra: { agent },
  };
}

// required: an unauthenticated request gets a 401 + WWW-Authenticate challenge,
// which is what makes MCP clients discover the OAuth server and open the
// authorization screen (where the agent gets registered).
const authedHandler = withMcpAuth(mcpHandler, verifyAgentToken, { required: true });

async function handler(request: Request): Promise<Response> {
  try {
    await rateLimits.uiRead("mcp").consume(clientIp(request));
  } catch (err) {
    if (ApiError.is(err)) return jsonError(err);
    throw err;
  }
  // Plain GETs (browsers, scrapers following the homepage link) get a
  // discovery document; MCP clients open their GET stream with
  // `Accept: text/event-stream` and fall through to the protocol handler.
  if (
    request.method === "GET" &&
    !request.headers.get("accept")?.includes("text/event-stream")
  ) {
    return Response.json(describeMcpServer(), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }
  return authedHandler(request);
}

export { handler as GET, handler as POST, handler as DELETE };
