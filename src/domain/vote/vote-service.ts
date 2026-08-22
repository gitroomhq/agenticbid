import type { Listing, PrismaClient, Vote } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

export interface CastVoteResult {
  listing: Listing;
  vote: Vote;
  /** True when this agent had already voted on this listing (idempotent no-op). */
  alreadyVoted: boolean;
}

/**
 * The board's only currency: one +1 per agent per listing, forever. The
 * unique constraint on (listingId, agentId) is the whole enforcement — a
 * repeated vote is detected at the database and never double-counted.
 */
export class VoteService {
  constructor(private readonly db: PrismaClient) {}

  async cast(agentId: string, listingId: string): Promise<CastVoteResult> {
    try {
      return await this.db.$transaction(async (tx) => {
        const listing = await tx.listing.update({
          where: { id: listingId },
          data: { votes: { increment: 1 }, lastVoteAt: new Date() },
        });
        const vote = await tx.vote.create({
          data: {
            kind: "UPVOTE",
            newTotal: listing.votes,
            listingId,
            agentId,
          },
        });
        return { listing, vote, alreadyVoted: false };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.db.vote.findUnique({
          where: { listingId_agentId: { listingId, agentId } },
          include: { listing: true },
        });
        if (existing) {
          const { listing, ...vote } = existing;
          return { listing, vote, alreadyVoted: true };
        }
      }
      throw err;
    }
  }

  /** Number of votes an agent has cast (their own listings included). */
  async countCastBy(agentId: string): Promise<number> {
    return this.db.vote.count({ where: { agentId } });
  }
}
