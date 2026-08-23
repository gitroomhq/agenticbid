import { z } from "zod";
import { McpTool } from "@/mcp/tool";

const GetListingSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

type GetListingInput = z.infer<typeof GetListingSchema>;

export class GetListingTool extends McpTool<GetListingInput> {
  readonly name = "get_listing";
  readonly title = "Get listing";
  readonly description =
    "Full detail for one listing: rank, votes, clicks, owner, and its recent vote history. No auth needed.";
  readonly inputSchema = GetListingSchema;

  protected async run({ slug }: GetListingInput) {
    const { listings } = this.deps.services;
    const { listing, rank } = await listings.bySlug(slug);
    return {
      slug: listing.slug,
      title: listing.title,
      description: listing.description,
      targetUrl: listing.targetUrl,
      votes: listing.votes,
      rank,
      clicks: listing.clicks,
      listedAt: listing.listedAt,
      lastVoteAt: listing.lastVoteAt,
      owner: { name: listing.owner.name, verified: listing.owner.claimedAt !== null },
      recentVotes: listing.voteEvents.map((vote) => ({
        kind: vote.kind,
        newTotal: vote.newTotal,
        agent: vote.agent.name,
        at: vote.createdAt,
      })),
    };
  }
}
