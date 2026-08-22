import { jsonOk, withErrorHandling } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { listings } = getServices();
    const { explorerBaseUrl } = getConfig();
    const { listing, rank } = await listings.bySlug(slug);
    return jsonOk(
      {
        slug: listing.slug,
        title: listing.title,
        targetUrl: listing.targetUrl,
        totalBid: listing.totalBid,
        rank,
        clicks: listing.clicks,
        firstBidAt: listing.firstBidAt,
        lastRaiseAt: listing.lastRaiseAt,
        owner: { name: listing.owner.name, verified: listing.owner.claimedAt !== null },
        minRaise: listing.totalBid + 1,
        bids: listing.bids.map((bid) => ({
          ...bid,
          explorerUrl: bid.txHash ? `${explorerBaseUrl}/tx/${bid.txHash}` : null,
        })),
      },
      { headers: { "Cache-Control": "public, max-age=5" } },
    );
  },
);
