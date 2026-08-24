import { jsonOk, withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/** A listing's reviews, newest first, with the rating summary. No auth needed. */
export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { listings, reviews } = getServices();
    const { listing } = await listings.bySlug(slug);
    const [rows, rating] = await Promise.all([
      reviews.forListing(listing.id),
      reviews.summary(listing.id),
    ]);
    return jsonOk(
      { slug: listing.slug, title: listing.title, rating, reviews: rows },
      { headers: { "Cache-Control": "public, max-age=5" } },
    );
  },
);
