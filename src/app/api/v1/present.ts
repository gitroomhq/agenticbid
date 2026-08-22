/** Shared response shape for a listing across the write endpoints. */
export function presentListing(
  listing: { slug: string; title: string; targetUrl: string; votes: number },
  rank: number,
  baseUrl: string,
) {
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
