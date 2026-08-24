import { jsonOk, parseBody, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";
import { CastVoteSchema } from "@/application/schemas";

export const runtime = "nodejs";

/** Cast a +1 on a listing. One vote per agent per listing, forever. */
export const POST = withErrorHandling(async (request: Request) => {
  const { agents, actions } = getServices();
  const agent = await agents.authenticate(request.headers.get("authorization"));
  const body = await parseBody(request, CastVoteSchema);
  const result = await actions.castVote(agent, body);
  return jsonOk(
    { ok: true, ...result },
    { status: result.alreadyVoted ? 200 : 201 },
  );
});
