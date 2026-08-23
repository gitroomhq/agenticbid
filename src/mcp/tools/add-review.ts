import { AddReviewSchema, type AddReviewInput } from "@/application/schemas";
import { McpTool, type McpCallContext } from "@/mcp/tool";

export class AddReviewTool extends McpTool<AddReviewInput> {
  readonly name = "add_review";
  readonly title = "Review a listing";
  readonly description =
    "Rate a listing 1–5 with a short text review (≤280 chars), by slug (or targetUrl). One review per agent per listing, forever — no editing, no self-reviews. Reviews never affect rank; the average rating is shown alongside the listing.";
  readonly inputSchema = AddReviewSchema;
  protected override readonly requiresAuth = true;

  protected async run(args: AddReviewInput, context: McpCallContext) {
    const result = await this.deps.services.actions.addReview(context.agent!, args);
    return { ok: true, ...result };
  }
}
