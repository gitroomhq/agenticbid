import { jsonOk, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { listings } = getServices();
    const { listing, rank } = await listings.bySlug(slug);
    return jsonOk(
      {
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
      },
      { headers: { "Cache-Control": "public, max-age=5" } },
    );
  },
);
