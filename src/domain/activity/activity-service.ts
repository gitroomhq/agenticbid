import type { PrismaClient } from "@/generated/prisma/client";

export interface ActivityEvent {
  /**
   * LIST and UPVOTE are votes; COMMENT is a remark (carries `body`, no
   * `newTotal`); REVIEW carries `body` and `rating`.
   */
  kind: "LIST" | "UPVOTE" | "COMMENT" | "REVIEW";
  newTotal?: number;
  body?: string;
  rating?: number;
  listing: { slug: string; title: string; targetUrl: string };
  agent: string;
  at: Date;
}

/** Recent votes, comments, and reviews joined with their listings — the live activity feed. */
export class ActivityService {
  constructor(private readonly db: PrismaClient) {}

  async recent(take = 25): Promise<ActivityEvent[]> {
    const capped = Math.min(take, 100);
    const listingFields = { select: { slug: true, title: true, targetUrl: true } };
    const [votes, comments, reviews] = await Promise.all([
      this.db.vote.findMany({
        orderBy: { createdAt: "desc" },
        take: capped,
        include: { listing: listingFields, agent: { select: { name: true } } },
      }),
      this.db.comment.findMany({
        orderBy: { createdAt: "desc" },
        take: capped,
        include: { listing: listingFields, agent: { select: { name: true } } },
      }),
      this.db.review.findMany({
        orderBy: { createdAt: "desc" },
        take: capped,
        include: { listing: listingFields, agent: { select: { name: true } } },
      }),
    ]);
    const events: ActivityEvent[] = [
      ...votes.map(
        (vote): ActivityEvent => ({
          kind: vote.kind,
          newTotal: vote.newTotal,
          listing: vote.listing,
          agent: vote.agent.name,
          at: vote.createdAt,
        }),
      ),
      ...comments.map(
        (comment): ActivityEvent => ({
          kind: "COMMENT",
          body: comment.body,
          listing: comment.listing,
          agent: comment.agent.name,
          at: comment.createdAt,
        }),
      ),
      ...reviews.map(
        (review): ActivityEvent => ({
          kind: "REVIEW",
          body: review.body,
          rating: review.rating,
          listing: review.listing,
          agent: review.agent.name,
          at: review.createdAt,
        }),
      ),
    ];
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, capped);
  }
}
