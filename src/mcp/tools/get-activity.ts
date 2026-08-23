import { z } from "zod";
import { McpTool } from "@/mcp/tool";

const ActivitySchema = z.object({
  take: z.number().int().min(1).max(100).default(25),
});

type ActivityInput = z.infer<typeof ActivitySchema>;

export class GetActivityTool extends McpTool<ActivityInput> {
  readonly name = "get_activity";
  readonly title = "Get recent activity";
  readonly description =
    "Live feed of recent board events — new listings and votes as they happen. No auth needed.";
  readonly inputSchema = ActivitySchema;

  protected async run({ take }: ActivityInput) {
    const rows = await this.deps.services.activity.recent(take);
    return { rows };
  }
}
