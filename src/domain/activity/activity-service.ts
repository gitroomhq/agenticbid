import type { PrismaClient } from "@/generated/prisma/client";

/** Recent bids joined with their listings — powers the live activity feed. */
export class ActivityService {
  constructor(private readonly db: PrismaClient) {}

  async recent(take = 25) {
    const bids = await this.db.bid.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 100),
      where: { txHash: { not: null } }, // only settled money shows up
      include: {
        listing: { select: { slug: true, title: true } },
        agent: { select: { name: true } },
      },
    });
    return bids.map((bid) => ({
      kind: bid.kind,
      amount: bid.amount,
      newTotal: bid.newTotal,
      listing: { slug: bid.listing.slug, title: bid.listing.title },
      agent: bid.agent.name,
      txHash: bid.txHash,
      network: bid.network,
      at: bid.createdAt,
    }));
  }
}
