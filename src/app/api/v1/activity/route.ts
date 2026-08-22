import { jsonOk, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export const GET = withErrorHandling(async (request: Request) => {
  const { activity } = getServices();
  const take = Number(new URL(request.url).searchParams.get("take") ?? 25) || 25;
  const rows = await activity.recent(take);
  return jsonOk({ rows }, { headers: { "Cache-Control": "public, max-age=5" } });
});
