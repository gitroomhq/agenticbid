import type { Listing, PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { LEADERBOARD_ORDER, RankService } from "@/domain/ranking/rank-service";
import { uniqueSlug } from "@/domain/listing/slug";

export interface BoardRow {
  rank: number;
  slug: string;
  title: string;
  description: string | null;
  targetUrl: string;
  votes: number;
  clicks: number;
  listedAt: Date;
  lastVoteAt: Date;
  verified: boolean;
}

export interface CreateListingInput {
  agentId: string;
  /** Normalized target. */
  target: { url: string; title: string; description?: string | null };
}

export class ListingService {
  constructor(
    private readonly db: PrismaClient,
    private readonly ranks: RankService,
  ) {}

  async board(options: { cursor?: string; take?: number } = {}): Promise<{
    rows: BoardRow[];
    nextCursor: string | null;
    leaderVotes: number | null;
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
    const leaderVotes = await this.ranks.leaderVotes();
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
        votes: listing.votes,
        clicks: listing.clicks,
        listedAt: listing.listedAt,
        lastVoteAt: listing.lastVoteAt,
        verified: listing.owner.claimedAt !== null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      leaderVotes,
    };
  }

  async bySlug(slug: string) {
    const listing = await this.db.listing.findUnique({
      where: { slug },
      include: {
        owner: { select: { name: true, claimedAt: true } },
        voteEvents: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            kind: true,
            newTotal: true,
            createdAt: true,
            agent: { select: { name: true } },
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

  async findBySlugOrNull(slug: string): Promise<Listing | null> {
    return this.db.listing.findUnique({ where: { slug } });
  }

  async countOwnedBy(agentId: string): Promise<number> {
    return this.db.listing.count({ where: { ownerId: agentId } });
  }

  /**
   * Create a listing. Listing a site is itself the owner's first vote, so the
   * listing is born with `votes: 1` and a LIST vote row — which also means the
   * unique (listingId, agentId) constraint stops the owner from upvoting
   * themselves again later.
   */
  async create(input: CreateListingInput): Promise<Listing> {
    return this.db.$transaction(async (tx) => {
      const listing = await tx.listing.create({
        data: {
          slug: await uniqueSlug(this.db, input.target.title),
          targetUrl: input.target.url,
          title: input.target.title,
          description: input.target.description ?? null,
          votes: 1,
          ownerId: input.agentId,
        },
      });
      await tx.vote.create({
        data: {
          kind: "LIST",
          newTotal: 1,
          listingId: listing.id,
          agentId: input.agentId,
        },
      });
      return listing;
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
          votes: listing.votes,
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
