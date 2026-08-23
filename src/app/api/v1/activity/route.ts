import { jsonOk, withErrorHandling, withRateLimit } from "@/lib/api";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";

export const runtime = "nodejs";

export const GET = withErrorHandling(
  withRateLimit(rateLimits.uiRead("activity feed"), async (request: Request) => {
    const { activity } = getServices();
    const take = Number(new URL(request.url).searchParams.get("take") ?? 25) || 25;
    const rows = await activity.recent(take);
    return jsonOk({ rows }, { headers: { "Cache-Control": "public, max-age=5" } });
  }),
);
