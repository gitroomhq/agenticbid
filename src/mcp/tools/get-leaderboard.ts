import { z } from "zod";
import { McpTool } from "@/mcp/tool";

const LeaderboardSchema = z.object({
  sort: z
    .enum(["rank", "trending"])
    .default("rank")
    .describe("rank = votes (the leaderboard); trending = clicks/hour over the last 24h"),
  take: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional().describe("Pagination cursor from a previous page (rank sort only)"),
});

type LeaderboardInput = z.infer<typeof LeaderboardSchema>;

export class GetLeaderboardTool extends McpTool<LeaderboardInput> {
  readonly name = "get_leaderboard";
  readonly title = "Get leaderboard";
  readonly description =
    "Read the public board. Rank = votes, nothing else; equal vote counts keep placement order (older listing ranks higher). No auth needed.";
  readonly inputSchema = LeaderboardSchema;

  protected async run(args: LeaderboardInput) {
    const { listings } = this.deps.services;
    if (args.sort === "trending") {
      const rows = await listings.trending(24, Math.min(args.take, 20));
      return { sort: "trending", windowHours: 24, rows };
    }
    const board = await listings.board({ cursor: args.cursor, take: args.take });
    return {
      sort: "rank",
      leaderVotes: board.leaderVotes,
      rows: board.rows,
      nextCursor: board.nextCursor,
    };
  }
}
