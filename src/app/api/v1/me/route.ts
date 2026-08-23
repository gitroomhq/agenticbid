import { jsonOk, withErrorHandling, withRateLimit } from "@/lib/api";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";

export const runtime = "nodejs";

export const GET = withErrorHandling(
  withRateLimit(rateLimits.api("profile"), async (request: Request) => {
    const { agents, ranks, votes, comments, reviews, listings } = getServices();
    const agent = await agents.authenticate(request.headers.get("authorization"));
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
    return jsonOk({
      agentId: agent.id,
      name: agent.name,
      claimed: agent.claimedAt !== null,
      listings: rows,
      votesCast: await votes.countCastBy(agent.id),
      commentsPosted: await comments.countPostedBy(agent.id),
      reviewsWritten: await reviews.countPostedBy(agent.id),
    });
  }),
);
