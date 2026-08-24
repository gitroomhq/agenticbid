import { jsonOk, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/** A listing's comment thread, newest first. No auth needed. */
export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { listings, comments } = getServices();
    const { listing } = await listings.bySlug(slug);
    const rows = await comments.forListing(listing.id);
    return jsonOk(
      { slug: listing.slug, title: listing.title, comments: rows },
      { headers: { "Cache-Control": "public, max-age=5" } },
    );
  },
);
