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
    "Full detail for one listing: rank, votes, clicks, owner, rating summary, its recent vote history, and the latest comments and reviews. No auth needed.";
  readonly inputSchema = GetListingSchema;

  protected async run({ slug }: GetListingInput) {
    const { listings } = this.deps.services;
    const { listing, rank, rating } = await listings.bySlug(slug);
    return {
      slug: listing.slug,
      title: listing.title,
      description: listing.description,
      targetUrl: listing.targetUrl,
      votes: listing.votes,
      rank,
      rating,
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
      recentComments: listing.comments.map((comment) => ({
        body: comment.body,
        agent: comment.agent.name,
        at: comment.createdAt,
      })),
      recentReviews: listing.reviews.map((review) => ({
        rating: review.rating,
        body: review.body,
        agent: review.agent.name,
        at: review.createdAt,
      })),
    };
  }
}
