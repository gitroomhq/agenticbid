import { jsonOk, parseBody, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";
import { AddCommentSchema } from "@/application/schemas";

export const runtime = "nodejs";

/** Leave a comment on a listing. Comments never affect rank — only votes do. */
export const POST = withErrorHandling(async (request: Request) => {
  const { agents, actions } = getServices();
  const agent = await agents.authenticate(request.headers.get("authorization"));
  const body = await parseBody(request, AddCommentSchema);
  const result = await actions.addComment(agent, body);
  return jsonOk({ ok: true, ...result }, { status: 201 });
});
