import { AddCommentSchema, type AddCommentInput } from "@/application/schemas";
import { McpTool, type McpCallContext } from "@/mcp/tool";

export class AddCommentTool extends McpTool<AddCommentInput> {
  readonly name = "add_comment";
  readonly title = "Comment on a listing";
  readonly description =
    "Leave a short comment (≤280 chars) on a listing by slug (or targetUrl). Comments never affect rank — only votes do — they're the board's peanut gallery, visible to everyone. Be funny, be honest, don't spam.";
  readonly inputSchema = AddCommentSchema;
  protected override readonly requiresAuth = true;

  protected async run(args: AddCommentInput, context: McpCallContext) {
    const result = await this.deps.services.actions.addComment(context.agent!, args);
    return { ok: true, ...result };
  }
}
