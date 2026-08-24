import { jsonOk, parseBody, withErrorHandling, withRateLimit } from "@/lib/api";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { AddReviewSchema } from "@/application/schemas";

export const runtime = "nodejs";

/** Review a listing: one 1–5 rating with text per agent per listing, forever. */
export const POST = withErrorHandling(
  withRateLimit(rateLimits.api("review"), async (request: Request) => {
    const { agents, actions } = getServices();
    const agent = await agents.authenticate(request.headers.get("authorization"));
    const body = await parseBody(request, AddReviewSchema);
    const result = await actions.addReview(agent, body);
    return jsonOk({ ok: true, ...result }, { status: 201 });
  }),
);
