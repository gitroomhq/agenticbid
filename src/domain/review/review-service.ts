import type { PrismaClient, Review } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

export interface AddReviewResult {
  review: Review;
  /** True when this agent had already reviewed this listing (nothing written). */
  alreadyReviewed: boolean;
}

export interface ReviewWithAgent {
  rating: number;
  body: string;
  agent: string;
  at: Date;
}

export interface RatingSummary {
  /** Average rating rounded to one decimal, or null when there are no reviews. */
  average: number | null;
  count: number;
}

/**
 * Reviews: one 1–5 rating with text per agent per listing, forever — same
 * immutability as votes (the unique constraint on listingId+agentId is the
 * enforcement). Like comments, reviews carry no rank weight; the average is
 * computed on read, never denormalized.
 */
export class ReviewService {
  constructor(private readonly db: PrismaClient) {}

  async add(
    agentId: string,
    listingId: string,
    rating: number,
    body: string,
  ): Promise<AddReviewResult> {
    try {
      const review = await this.db.review.create({
        data: { agentId, listingId, rating, body },
      });
      return { review, alreadyReviewed: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.db.review.findUnique({
          where: { listingId_agentId: { listingId, agentId } },
        });
        if (existing) return { review: existing, alreadyReviewed: true };
      }
      throw err;
    }
  }

  /** A listing's reviews, newest first. */
  async forListing(listingId: string, take = 50): Promise<ReviewWithAgent[]> {
    const reviews = await this.db.review.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 100),
      include: { agent: { select: { name: true } } },
    });
    return reviews.map((review) => ({
      rating: review.rating,
      body: review.body,
      agent: review.agent.name,
      at: review.createdAt,
    }));
  }

  async summary(listingId: string): Promise<RatingSummary> {
    const aggregate = await this.db.review.aggregate({
      where: { listingId },
      _avg: { rating: true },
      _count: true,
    });
    return {
      average: aggregate._avg.rating === null ? null : round1(aggregate._avg.rating),
      count: aggregate._count,
    };
  }

  /** Rating summaries for a set of listings in one query (board page). */
  async summaries(listingIds: string[]): Promise<Map<string, RatingSummary>> {
    if (listingIds.length === 0) return new Map();
    const grouped = await this.db.review.groupBy({
      by: ["listingId"],
      where: { listingId: { in: listingIds } },
      _avg: { rating: true },
      _count: { listingId: true },
    });
    return new Map(
      grouped.map((row) => [
        row.listingId,
        {
          average: row._avg.rating === null ? null : round1(row._avg.rating),
          count: row._count.listingId,
        },
      ]),
    );
  }

  /** Number of reviews an agent has written across the board. */
  async countPostedBy(agentId: string): Promise<number> {
    return this.db.review.count({ where: { agentId } });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
