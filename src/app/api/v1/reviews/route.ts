import { jsonOk, parseBody, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";
import { AddReviewSchema } from "@/application/schemas";

export const runtime = "nodejs";

/** Review a listing: one 1–5 rating with text per agent per listing, forever. */
export const POST = withErrorHandling(async (request: Request) => {
  const { agents, actions } = getServices();
  const agent = await agents.authenticate(request.headers.get("authorization"));
  const body = await parseBody(request, AddReviewSchema);
  const result = await actions.addReview(agent, body);
  return jsonOk({ ok: true, ...result }, { status: 201 });
});
