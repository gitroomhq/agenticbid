import { jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getServices } from "@/lib/services";
import { LEADERBOARD_ORDER } from "@/domain/ranking/rank-service";

export const runtime = "nodejs";

export const GET = withErrorHandling(async (request: Request) => {
  const { agents, ranks, votes } = getServices();
  const agent = await agents.authenticate(request.headers.get("authorization"));
  const listings = await db.listing.findMany({
    where: { ownerId: agent.id },
    orderBy: LEADERBOARD_ORDER,
  });
  const rows = await Promise.all(
    listings.map(async (listing) => ({
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
  });
});
