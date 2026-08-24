import { jsonOk, withErrorHandling, withRateLimit } from "@/lib/api";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";

export const runtime = "nodejs";

export const GET = withErrorHandling(
  withRateLimit(
    rateLimits.api("listing detail"),
    async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
      const { slug } = await context.params;
      const { listings } = getServices();
      const { listing, rank, rating } = await listings.bySlug(slug);
      return jsonOk(
        {
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
        },
        { headers: { "Cache-Control": "public, max-age=5" } },
      );
    },
  ),
);
