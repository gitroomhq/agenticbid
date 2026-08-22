import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Rank is derived, never stored: ORDER BY totalBid DESC, firstBidAt ASC —
 * equal bids keep placement order (the older bid holds the higher rank).
 * `id` is a final deterministic tiebreaker for identical timestamps.
 */
export const LEADERBOARD_ORDER = [
  { totalBid: "desc" as const },
  { firstBidAt: "asc" as const },
  { id: "asc" as const },
];

/** Pure comparator matching LEADERBOARD_ORDER — usable on in-memory rows. */
export function compareForRank(
  a: { totalBid: number; firstBidAt: Date; id: string },
  b: { totalBid: number; firstBidAt: Date; id: string },
): number {
  if (a.totalBid !== b.totalBid) return b.totalBid - a.totalBid;
  if (a.firstBidAt.getTime() !== b.firstBidAt.getTime()) {
    return a.firstBidAt.getTime() - b.firstBidAt.getTime();
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class RankService {
  constructor(private readonly db: PrismaClient) {}

  /** Current 1-based rank of a listing. */
  async rankOf(listing: { id: string; totalBid: number; firstBidAt: Date }): Promise<number> {
    const ahead = await this.db.listing.count({
      where: {
        OR: [
          { totalBid: { gt: listing.totalBid } },
          { totalBid: listing.totalBid, firstBidAt: { lt: listing.firstBidAt } },
          {
            totalBid: listing.totalBid,
            firstBidAt: listing.firstBidAt,
            id: { lt: listing.id },
          },
        ],
      },
    });
    return ahead + 1;
  }

  /** The current leader's total bid, or null when the board is empty. */
  async leaderTotal(excludeListingId?: string): Promise<number | null> {
    const leader = await this.db.listing.findFirst({
      where: excludeListingId ? { id: { not: excludeListingId } } : undefined,
      orderBy: LEADERBOARD_ORDER,
      select: { totalBid: true },
    });
    return leader?.totalBid ?? null;
  }
}
