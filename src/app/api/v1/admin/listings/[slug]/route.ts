import { jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Admin delist: removes a listing that violates the rules (no refunds — the
 * settled bids stay in the ledger). Guarded by the ADMIN_TOKEN env var;
 * disabled entirely when the var is unset.
 */
export const DELETE = withErrorHandling(
  async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const adminToken = process.env.ADMIN_TOKEN;
    const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!adminToken || presented !== adminToken) {
      throw new ApiError(404, "not_found", "Nothing here.");
    }
    const { slug } = await context.params;
    const listing = await db.listing.findUnique({ where: { slug } });
    if (!listing) throw new ApiError(404, "listing_not_found", `No listing "${slug}".`);
    await db.$transaction([
      db.clickEvent.deleteMany({ where: { listingId: listing.id } }),
      db.bid.deleteMany({ where: { listingId: listing.id } }),
      db.listing.delete({ where: { id: listing.id } }),
    ]);
    logger.warn("listing_delisted", { slug, title: listing.title, totalBid: listing.totalBid });
    return jsonOk({ ok: true, delisted: slug });
  },
);
