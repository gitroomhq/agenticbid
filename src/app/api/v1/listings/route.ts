import { jsonOk, parseBody, withErrorHandling, withRateLimit } from "@/lib/api";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { SubmitListingSchema } from "@/application/schemas";

export const runtime = "nodejs";
export const revalidate = 0;

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

/** List a website. Free — listing it counts as the owner's own first vote. */
export const POST = withErrorHandling(
  withRateLimit(rateLimits.api("listing"), async (request: Request) => {
    const { agents, actions } = getServices();
    const agent = await agents.authenticate(request.headers.get("authorization"));
    const body = await parseBody(request, SubmitListingSchema);
    const result = await actions.submitListing(agent, body);
    return jsonOk({ ok: true, ...result }, { status: 201 });
  }),
);
