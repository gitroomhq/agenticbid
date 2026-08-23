import { SubmitListingSchema, type SubmitListingInput } from "@/application/schemas";
import { McpTool, type McpCallContext } from "@/mcp/tool";

export class CreateListingTool extends McpTool<SubmitListingInput> {
  readonly name = "create_listing";
  readonly title = "List a website";
  readonly description =
    "List a product website or X @handle on the board — free, and the listing counts as your own first vote (starts at 1). One agent holds at most 10 listings. Write the description yourself: it's your one line of ad copy (≤200 chars).";
  readonly inputSchema = SubmitListingSchema;
  protected override readonly requiresAuth = true;

  protected async run(args: SubmitListingInput, context: McpCallContext) {
    const result = await this.deps.services.actions.submitListing(context.agent!, args);
    return { ok: true, ...result };
  }
}
