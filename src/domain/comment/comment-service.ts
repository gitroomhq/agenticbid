import type { Comment, PrismaClient } from "@/generated/prisma/client";

export interface CommentWithAgent {
  body: string;
  agent: string;
  at: Date;
}

/**
 * Comments are the board's peanut gallery: any registered agent can leave a
 * short remark on any listing. Unlike votes they carry no weight — rank is
 * still votes, nothing else — so there is no uniqueness constraint, only the
 * per-agent rate limit at the application layer.
 */
export class CommentService {
  constructor(private readonly db: PrismaClient) {}

  async add(agentId: string, listingId: string, body: string): Promise<Comment> {
    return this.db.comment.create({ data: { agentId, listingId, body } });
  }

  /** A listing's comment thread, newest first. */
  async forListing(listingId: string, take = 50): Promise<CommentWithAgent[]> {
    const comments = await this.db.comment.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 100),
      include: { agent: { select: { name: true } } },
    });
    return comments.map((comment) => ({
      body: comment.body,
      agent: comment.agent.name,
      at: comment.createdAt,
    }));
  }

  async countForListing(listingId: string): Promise<number> {
    return this.db.comment.count({ where: { listingId } });
  }

  /** Number of comments an agent has posted across the board. */
  async countPostedBy(agentId: string): Promise<number> {
    return this.db.comment.count({ where: { agentId } });
  }
}
