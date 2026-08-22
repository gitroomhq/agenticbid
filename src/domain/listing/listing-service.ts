import type { Bid, Listing, PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import type { Quote, PricingEngine } from "@/domain/pricing/pricing-engine";
import { LEADERBOARD_ORDER, RankService } from "@/domain/ranking/rank-service";
import { uniqueSlug } from "@/domain/listing/slug";

export interface BoardRow {
  rank: number;
  slug: string;
  title: string;
  description: string | null;
  targetUrl: string;
  totalBid: number;
  clicks: number;
  firstBidAt: Date;
  lastRaiseAt: Date;
  verified: boolean;
  minRaise: number;
}

export interface ApplyBidInput {
  agentId: string;
  /** Normalized target; url/title ignored for raises. */
  target: { url: string; title: string; description?: string | null };
  quote: Quote;
  /** Existing listing id when raising. */
  listingId?: string;
  paymentNonce: string;
  network: string;
  payerAddress: string;
}

export interface ApplyBidResult {
  listing: Listing;
  bid: Bid;
  /** True when this exact payment credential was already applied (replay). */
  replayed: boolean;
}

export class ListingService {
  constructor(
    private readonly db: PrismaClient,
    private readonly ranks: RankService,
    private readonly pricing: PricingEngine,
  ) {}

  async board(options: { cursor?: string; take?: number } = {}): Promise<{
    rows: BoardRow[];
    nextCursor: string | null;
    priceToBeatNumber1: number;
  }> {
    const take = Math.min(options.take ?? 50, 100);
    const listings = await this.db.listing.findMany({
      orderBy: LEADERBOARD_ORDER,
      include: { owner: { select: { claimedAt: true } } },
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = listings.length > take;
    const page = listings.slice(0, take);
    const leaderTotal = await this.ranks.leaderTotal();
    const baseRank = options.cursor
      ? await this.ranks.rankOf(await this.mustGet(options.cursor))
      : 0;
    return {
      rows: page.map((listing, index) => ({
        rank: baseRank + index + 1,
        slug: listing.slug,
        title: listing.title,
        description: listing.description,
        targetUrl: listing.targetUrl,
        totalBid: listing.totalBid,
        clicks: listing.clicks,
        firstBidAt: listing.firstBidAt,
        lastRaiseAt: listing.lastRaiseAt,
        verified: listing.owner.claimedAt !== null,
        minRaise: listing.totalBid + 1,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      priceToBeatNumber1: this.pricing.priceToBeatNumber1(leaderTotal),
    };
  }

  async bySlug(slug: string) {
    const listing = await this.db.listing.findUnique({
      where: { slug },
      include: {
        owner: { select: { name: true, claimedAt: true } },
        bids: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            amount: true,
            newTotal: true,
            kind: true,
            txHash: true,
            network: true,
            payerAddress: true,
            createdAt: true,
          },
        },
      },
    });
    if (!listing) {
      throw new ApiError(404, "listing_not_found", `No listing with slug "${slug}".`);
    }
    const rank = await this.ranks.rankOf(listing);
    return { listing, rank };
  }

  async findByTargetUrl(targetUrl: string): Promise<Listing | null> {
    return this.db.listing.findUnique({ where: { targetUrl } });
  }

  async countOwnedBy(agentId: string): Promise<number> {
    return this.db.listing.count({ where: { ownerId: agentId } });
  }

  /**
   * Apply a verified (not yet settled) bid atomically. The unique constraint
   * on `paymentNonce` makes a replayed payment credential a no-op: the
   * original application is returned with `replayed: true`.
   */
  async applyVerifiedBid(input: ApplyBidInput): Promise<ApplyBidResult> {
    try {
      return await this.db.$transaction(async (tx) => {
        let listing: Listing;
        if (input.quote.kind === "RAISE") {
          if (!input.listingId) throw new Error("listingId required for raises");
          listing = await tx.listing.update({
            where: { id: input.listingId },
            data: {
              totalBid: input.quote.newTotal,
              lastRaiseAt: new Date(),
              // owners may refresh their blurb when raising
              ...(input.target.description !== undefined && input.target.description !== null
                ? { description: input.target.description }
                : {}),
            },
          });
        } else {
          listing = await tx.listing.create({
            data: {
              slug: await uniqueSlug(this.db, input.target.title),
              targetUrl: input.target.url,
              title: input.target.title,
              description: input.target.description ?? null,
              totalBid: input.quote.newTotal,
              ownerId: input.agentId,
            },
          });
        }
        const bid = await tx.bid.create({
          data: {
            amount: input.quote.charge,
            newTotal: input.quote.newTotal,
            kind: input.quote.kind,
            paymentNonce: input.paymentNonce,
            network: input.network,
            payerAddress: input.payerAddress,
            listingId: listing.id,
            agentId: input.agentId,
          },
        });
        return { listing, bid, replayed: false };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.db.bid.findUnique({
          where: { paymentNonce: input.paymentNonce },
          include: { listing: true },
        });
        if (existing) {
          return { listing: existing.listing, bid: existing, replayed: true };
        }
      }
      throw err;
    }
  }

  /** Record the settlement tx hash once the facilitator confirms. */
  async markSettled(bidId: string, txHash: string): Promise<void> {
    await this.db.bid.update({ where: { id: bidId }, data: { txHash } });
  }

  /**
   * Compensating transaction when settlement fails: the bid never happened.
   * New listings are removed entirely; raises are rolled back to the previous
   * total.
   */
  async rollbackBid(result: ApplyBidResult): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.bid.delete({ where: { id: result.bid.id } });
      if (result.bid.kind === "NEW") {
        await tx.clickEvent.deleteMany({ where: { listingId: result.listing.id } });
        await tx.listing.delete({ where: { id: result.listing.id } });
      } else {
        await tx.listing.update({
          where: { id: result.listing.id },
          data: { totalBid: result.listing.totalBid - result.bid.amount },
        });
      }
    });
  }

  /** Resolve a click: bump counters and return the redirect target. */
  async recordClick(slug: string): Promise<string> {
    const listing = await this.db.listing.findUnique({ where: { slug } });
    if (!listing) {
      throw new ApiError(404, "listing_not_found", `No listing with slug "${slug}".`);
    }
    // fire-and-forget: never block the redirect on analytics writes
    void this.db
      .$transaction([
        this.db.listing.update({
          where: { id: listing.id },
          data: { clicks: { increment: 1 } },
        }),
        this.db.clickEvent.create({ data: { listingId: listing.id } }),
      ])
      .catch(() => undefined);
    return listing.targetUrl;
  }

  /** Top listings by clicks/hour over a trailing window. */
  async trending(windowHours = 24, take = 5) {
    const since = new Date(Date.now() - windowHours * 3_600_000);
    const grouped = await this.db.clickEvent.groupBy({
      by: ["listingId"],
      where: { createdAt: { gte: since } },
      _count: { listingId: true },
      orderBy: { _count: { listingId: "desc" } },
      take,
    });
    if (grouped.length === 0) return [];
    const listings = await this.db.listing.findMany({
      where: { id: { in: grouped.map((g) => g.listingId) } },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    return grouped
      .map((g) => {
        const listing = byId.get(g.listingId);
        if (!listing) return null;
        return {
          slug: listing.slug,
          title: listing.title,
          targetUrl: listing.targetUrl,
          totalBid: listing.totalBid,
          clicksInWindow: g._count.listingId,
          clicksPerHour: Math.round((g._count.listingId / windowHours) * 100) / 100,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  private async mustGet(id: string): Promise<Listing> {
    const listing = await this.db.listing.findUnique({ where: { id } });
    if (!listing) throw new ApiError(400, "invalid_cursor", "Unknown pagination cursor.");
    return listing;
  }
}
