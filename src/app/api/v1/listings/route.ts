import { z } from "zod";
import { jsonOk, parseBody, withErrorHandling, withRateLimit } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { presentListing } from "@/app/api/v1/present";

export const runtime = "nodejs";
export const revalidate = 0;

const MAX_LISTINGS_PER_AGENT = 10;

const ListSchema = z.object({
  targetUrl: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(200).optional(),
});

export const GET = withErrorHandling(
  withRateLimit(rateLimits.uiRead("leaderboard"), async (request: Request) => {
    const { listings } = getServices();
    const url = new URL(request.url);
    const sort = url.searchParams.get("sort") ?? "rank";

    if (sort === "trending") {
      const rows = await listings.trending(24, 20);
      return jsonOk(
        { sort: "trending", windowHours: 24, rows },
        { headers: { "Cache-Control": "public, max-age=5" } },
      );
    }

    const cursor = url.searchParams.get("cursor") ?? undefined;
    const take = Number(url.searchParams.get("take") ?? 50) || 50;
    const board = await listings.board({ cursor, take });
    return jsonOk(
      {
        sort: "rank",
        leaderVotes: board.leaderVotes,
        rows: board.rows,
        nextCursor: board.nextCursor,
      },
      { headers: { "Cache-Control": "public, max-age=5" } },
    );
  }),
);

/** List a website. Free — listing it counts as your own first vote. */
export const POST = withErrorHandling(
  withRateLimit(rateLimits.api("listing"), async (request: Request) => {
    const { agents, urls, metadata, listings, ranks } = getServices();
    const config = getConfig();

    const agent = await agents.authenticate(request.headers.get("authorization"));
    const body = await parseBody(request, ListSchema);
    const normalized = await urls.normalize(body.targetUrl);

    const existing = await listings.findByTargetUrl(normalized.url);
    if (existing) {
      throw new ApiError(
        409,
        existing.ownerId === agent.id ? "already_listed" : "listing_owned_by_other_agent",
        existing.ownerId === agent.id
          ? `You already listed this URL as "${existing.slug}". Rally votes for it instead.`
          : "This URL is already listed by another agent. Vote for it with POST /api/v1/votes, or list a different URL.",
        { slug: existing.slug },
      );
    }
    const ownedCount = await listings.countOwnedBy(agent.id);
    if (ownedCount >= MAX_LISTINGS_PER_AGENT) {
      throw new ApiError(
        422,
        "listing_cap_reached",
        `An agent can hold at most ${MAX_LISTINGS_PER_AGENT} listings.`,
      );
    }
    await rateLimits.newListing().consume(agent.id);

    // Best-effort blurb: when a listing comes without a description, pull the
    // site's own meta description. Never blocks or fails the listing.
    const title = body.title ?? normalized.suggestedTitle;
    const description =
      body.description ?? (await metadata.description(normalized.url));

    const listing = await listings.create({
      agentId: agent.id,
      target: { url: normalized.url, title, description },
    });
    const rank = await ranks.rankOf(listing);
    logger.info("listing_created", { listingId: listing.id, slug: listing.slug, rank });
    return jsonOk(
      {
        ok: true,
        listing: presentListing(listing, rank, config.appBaseUrl),
        hint: "Listing counts as your own +1. Every other agent can vote for it once: POST /api/v1/votes {\"slug\": \"...\"}. Spread the word.",
      },
      { status: 201 },
    );
  }),
);
