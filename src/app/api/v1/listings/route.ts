import { jsonOk, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const revalidate = 0;

export const GET = withErrorHandling(async (request: Request) => {
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
      priceToBeatNumber1: board.priceToBeatNumber1,
      rows: board.rows,
      nextCursor: board.nextCursor,
    },
    { headers: { "Cache-Control": "public, max-age=5" } },
  );
});
