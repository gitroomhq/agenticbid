import { jsonOk, withErrorHandling } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export const GET = withErrorHandling(async (request: Request) => {
  const { activity } = getServices();
  const { explorerBaseUrl } = getConfig();
  const take = Number(new URL(request.url).searchParams.get("take") ?? 25) || 25;
  const rows = await activity.recent(take);
  return jsonOk(
    {
      rows: rows.map((row) => ({
        ...row,
        explorerUrl: row.txHash ? `${explorerBaseUrl}/tx/${row.txHash}` : null,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=5" } },
  );
});
