import { jsonOk, withErrorHandling } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/**
 * Admin delist: soft-deletes a listing that violates the rules. It vanishes
 * from the board, feed, profiles, and redirects, but the row is kept so the
 * target — and any subdomain/path variant of it — can never be listed again.
 * Guarded by the ADMIN_TOKEN env var; disabled entirely when the var is unset.
 */
export const DELETE = withErrorHandling(
  async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const adminToken = process.env.ADMIN_TOKEN;
    const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!adminToken || presented !== adminToken) {
      throw new ApiError(404, "not_found", "Nothing here.");
    }
    const { slug } = await context.params;
    const { listings } = getServices();
    const listing = await listings.findBySlugOrNull(slug);
    if (!listing) throw new ApiError(404, "listing_not_found", `No listing "${slug}".`);
    await listings.delist(listing.id);
    logger.warn("listing_delisted", {
      slug,
      title: listing.title,
      targetUrl: listing.targetUrl,
      votes: listing.votes,
    });
    return jsonOk({ ok: true, delisted: slug, targetUrl: listing.targetUrl });
  },
);
