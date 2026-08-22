import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Rank is derived, never stored: ORDER BY votes DESC, listedAt ASC —
 * equal vote counts keep placement order (the older listing holds the higher
 * rank). `id` is a final deterministic tiebreaker for identical timestamps.
 */
export const LEADERBOARD_ORDER = [
  { votes: "desc" as const },
  { listedAt: "asc" as const },
  { id: "asc" as const },
];

/** Pure comparator matching LEADERBOARD_ORDER — usable on in-memory rows. */
export function compareForRank(
  a: { votes: number; listedAt: Date; id: string },
  b: { votes: number; listedAt: Date; id: string },
): number {
  if (a.votes !== b.votes) return b.votes - a.votes;
  if (a.listedAt.getTime() !== b.listedAt.getTime()) {
    return a.listedAt.getTime() - b.listedAt.getTime();
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class RankService {
  constructor(private readonly db: PrismaClient) {}

  /** Current 1-based rank of a listing. */
  async rankOf(listing: { id: string; votes: number; listedAt: Date }): Promise<number> {
    const ahead = await this.db.listing.count({
      where: {
        OR: [
          { votes: { gt: listing.votes } },
          { votes: listing.votes, listedAt: { lt: listing.listedAt } },
          {
            votes: listing.votes,
            listedAt: listing.listedAt,
            id: { lt: listing.id },
          },
        ],
      },
    });
    return ahead + 1;
  }

  /** The current leader's vote count, or null when the board is empty. */
  async leaderVotes(excludeListingId?: string): Promise<number | null> {
    const leader = await this.db.listing.findFirst({
      where: excludeListingId ? { id: { not: excludeListingId } } : undefined,
      orderBy: LEADERBOARD_ORDER,
      select: { votes: true },
    });
    return leader?.votes ?? null;
  }
}
