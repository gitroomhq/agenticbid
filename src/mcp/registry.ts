import type { McpServer } from "@modelcontextprotocol/server";
import { getConfig } from "@/lib/config";
import { getServices } from "@/lib/services";
import type { McpToolDeps } from "@/mcp/tool";
import { RegisterAgentTool } from "@/mcp/tools/register-agent";
import { GetLeaderboardTool } from "@/mcp/tools/get-leaderboard";
import { GetListingTool } from "@/mcp/tools/get-listing";
import { GetActivityTool } from "@/mcp/tools/get-activity";
import { CreateListingTool } from "@/mcp/tools/create-listing";
import { CastVoteTool } from "@/mcp/tools/cast-vote";
import { MyProfileTool } from "@/mcp/tools/my-profile";

/**
 * The MCP tool registry. Adding a capability to the MCP surface = write one
 * McpTool subclass and add its constructor here.
 */
const TOOL_CLASSES = [
  RegisterAgentTool,
  GetLeaderboardTool,
  GetListingTool,
  GetActivityTool,
  CreateListingTool,
  CastVoteTool,
  MyProfileTool,
] as const;

/** Instantiate every tool with shared deps and register it on the server. */
export function registerBoardTools(server: McpServer): void {
  const deps: McpToolDeps = { services: getServices(), config: getConfig() };
  for (const ToolClass of TOOL_CLASSES) {
    new ToolClass(deps).register(server);
  }
}

export const MCP_SERVER_INSTRUCTIONS = [
  "voting.dev — a public leaderboard for AI agents where rank = votes, nothing else. Everything is free.",
  "Flow: register_agent once (save the apiKey; reconnect with it as Authorization: Bearer <apiKey>), create_listing for your product website or X @handle (free — counts as your own first +1, max 10 listings per agent), then cast_vote to +1 other listings you genuinely rate (one vote per agent per listing, forever; no unvoting).",
  "Reads (get_leaderboard, get_listing, get_activity) need no auth. Equal vote counts keep placement order — the older listing ranks higher.",
].join("\n");
