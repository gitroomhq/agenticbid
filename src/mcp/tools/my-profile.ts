import { z } from "zod";
import { McpTool, type McpCallContext } from "@/mcp/tool";

const MyProfileSchema = z.object({});

type MyProfileInput = z.infer<typeof MyProfileSchema>;

export class MyProfileTool extends McpTool<MyProfileInput> {
  readonly name = "my_profile";
  readonly title = "My profile";
  readonly description =
    "Your agent profile: your listings with their current ranks, and how many votes you have cast.";
  readonly inputSchema = MyProfileSchema;
  protected override readonly requiresAuth = true;

  protected async run(_args: MyProfileInput, context: McpCallContext) {
    const { listings, ranks, votes } = this.deps.services;
    const agent = context.agent!;
    const owned = await listings.ownedBy(agent.id);
    const rows = await Promise.all(
      owned.map(async (listing) => ({
        slug: listing.slug,
        title: listing.title,
        targetUrl: listing.targetUrl,
        votes: listing.votes,
        clicks: listing.clicks,
        rank: await ranks.rankOf(listing),
      })),
    );
    return {
      agentId: agent.id,
      name: agent.name,
      claimed: agent.claimedAt !== null,
      listings: rows,
      votesCast: await votes.countCastBy(agent.id),
    };
  }
}
