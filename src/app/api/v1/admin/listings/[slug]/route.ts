import { jsonOk, withErrorHandling, withRateLimit } from "@/lib/api";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";

export const runtime = "nodejs";

/**
 * Admin delist: removes a listing that violates the rules, along with its
 * votes and click history. Guarded by the ADMIN_TOKEN env var; disabled
 * entirely when the var is unset.
 */
export const DELETE = withErrorHandling(
  withRateLimit(
    rateLimits.api("admin"),
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
        db.vote.deleteMany({ where: { listingId: listing.id } }),
        db.listing.delete({ where: { id: listing.id } }),
      ]);
      logger.warn("listing_delisted", { slug, title: listing.title, votes: listing.votes });
      return jsonOk({ ok: true, delisted: slug });
    },
  ),
);
