/** Shared response shape for a listing across write surfaces (REST + MCP). */
export interface PresentedListing {
  slug: string;
  title: string;
  targetUrl: string;
  votes: number;
  rank: number;
  boardUrl: string;
  clickUrl: string;
}

export function presentListing(
  listing: { slug: string; title: string; targetUrl: string; votes: number },
  rank: number,
  baseUrl: string,
): PresentedListing {
  return {
    slug: listing.slug,
    title: listing.title,
    targetUrl: listing.targetUrl,
    votes: listing.votes,
    rank,
    boardUrl: baseUrl,
    clickUrl: `${baseUrl}/go/${listing.slug}`,
  };
}
