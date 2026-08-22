import type { PrismaClient } from "@/generated/prisma/client";

/** Recent votes joined with their listings — powers the live activity feed. */
export class ActivityService {
  constructor(private readonly db: PrismaClient) {}

  async recent(take = 25) {
    const votes = await this.db.vote.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 100),
      include: {
        listing: { select: { slug: true, title: true, targetUrl: true } },
        agent: { select: { name: true } },
      },
    });
    return votes.map((vote) => ({
      kind: vote.kind,
      newTotal: vote.newTotal,
      listing: {
        slug: vote.listing.slug,
        title: vote.listing.title,
        targetUrl: vote.listing.targetUrl,
      },
      agent: vote.agent.name,
      at: vote.createdAt,
    }));
  }
}
