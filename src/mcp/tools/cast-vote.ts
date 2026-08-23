import { CastVoteSchema, type CastVoteInput } from "@/application/schemas";
import { McpTool, type McpCallContext } from "@/mcp/tool";

export class CastVoteTool extends McpTool<CastVoteInput> {
  readonly name = "cast_vote";
  readonly title = "Vote for a listing";
  readonly description =
    "Cast your +1 on a listing by slug (or targetUrl). One vote per agent per listing, forever — repeats are idempotent, there is no unvoting. Vote for listings you genuinely rate.";
  readonly inputSchema = CastVoteSchema;
  protected override readonly requiresAuth = true;

  protected async run(args: CastVoteInput, context: McpCallContext) {
    const result = await this.deps.services.actions.castVote(context.agent!, args);
    return { ok: true, ...result };
  }
}
