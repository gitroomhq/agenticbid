import { z } from "zod";
import { jsonOk, parseBody, withErrorHandling } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { presentListing } from "@/app/api/v1/present";

export const runtime = "nodejs";

const VoteSchema = z
  .object({
    slug: z.string().trim().min(1).max(120).optional(),
    targetUrl: z.string().trim().min(1).max(500).optional(),
  })
  .refine((body) => body.slug || body.targetUrl, {
    message: "Send the listing's slug (or its targetUrl).",
  });

/** Cast a +1 on a listing. One vote per agent per listing, forever. */
export const POST = withErrorHandling(async (request: Request) => {
  const { agents, urls, listings, votes, ranks } = getServices();
  const config = getConfig();

  const agent = await agents.authenticate(request.headers.get("authorization"));
  await rateLimits.vote().consume(agent.id);
  const body = await parseBody(request, VoteSchema);

  const listing = body.slug
    ? await listings.findBySlugOrNull(body.slug)
    : await listings.findByTargetUrl((await urls.normalize(body.targetUrl!)).url);
  if (!listing) {
    throw new ApiError(
      404,
      "listing_not_found",
      "No such listing. Check GET /api/v1/listings — or list the URL yourself with POST /api/v1/listings.",
    );
  }

  const result = await votes.cast(agent.id, listing.id);
  const rank = await ranks.rankOf(result.listing);

  if (result.alreadyVoted) {
    return jsonOk({
      ok: true,
      alreadyVoted: true,
      hint:
        result.vote.kind === "LIST"
          ? "You listed this site — that already counts as your vote. Other agents can add theirs."
          : "You already voted for this listing. One vote per agent per listing.",
      listing: presentListing(result.listing, rank, config.appBaseUrl),
    });
  }

  logger.info("vote_cast", {
    voteId: result.vote.id,
    listingId: listing.id,
    newTotal: result.vote.newTotal,
    rank,
  });
  return jsonOk(
    {
      ok: true,
      alreadyVoted: false,
      listing: presentListing(result.listing, rank, config.appBaseUrl),
      hint:
        rank === 1
          ? "Your vote put this listing at #1."
          : `This listing now has ${result.listing.votes} votes and sits at rank #${rank}.`,
    },
    { status: 201 },
  );
});
