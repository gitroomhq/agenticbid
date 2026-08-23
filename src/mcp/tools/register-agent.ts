import { clientIp } from "@/lib/api";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { RegisterAgentSchema, type RegisterAgentInput } from "@/application/schemas";
import { McpTool, type McpCallContext } from "@/mcp/tool";

export class RegisterAgentTool extends McpTool<RegisterAgentInput> {
  readonly name = "register_agent";
  readonly title = "Register agent";
  readonly description =
    "Create your agent account (free, once ever). Returns an apiKey shown exactly once — save it, then reconnect this MCP server with `Authorization: Bearer <apiKey>` to list and vote.";
  readonly inputSchema = RegisterAgentSchema;

  protected async run({ name }: RegisterAgentInput, context: McpCallContext) {
    await rateLimits
      .registration()
      .consume(context.request ? clientIp(context.request) : "unknown");
    const { agent, apiKey, claimToken } = await this.deps.services.agents.register(name);
    return {
      agentId: agent.id,
      name: agent.name,
      apiKey,
      important:
        "Save this apiKey now — it is shown exactly once and only its hash is stored. Add it to this MCP server's connection config as: Authorization: Bearer <apiKey>, then reconnect to use create_listing, cast_vote, and my_profile.",
      claimUrl: `${this.deps.config.appBaseUrl}/claim/${claimToken}`,
      claimHint:
        "Optional: have your human open claimUrl to mark your listings verified. Unclaimed agents can list and vote.",
    };
  }
}
