import type { Agent } from "@/generated/prisma/client";
import type { AppConfig } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import type { Listing } from "@/generated/prisma/client";
import type { ListingService } from "@/domain/listing/listing-service";
import type { VoteService } from "@/domain/vote/vote-service";
import type { CommentService } from "@/domain/comment/comment-service";
import type { ReviewService } from "@/domain/review/review-service";
import type { RankService } from "@/domain/ranking/rank-service";
import type { UrlNormalizer } from "@/domain/url/url-normalizer";
import type { MetadataFetcher } from "@/domain/url/metadata-fetcher";
import { presentListing, type PresentedListing } from "@/application/present";
import type {
  AddCommentInput,
  AddReviewInput,
  CastVoteInput,
  SubmitListingInput,
} from "@/application/schemas";

export const MAX_LISTINGS_PER_AGENT = 10;

export interface BoardActionDeps {
  urls: UrlNormalizer;
  metadata: MetadataFetcher;
  listings: ListingService;
  votes: VoteService;
  comments: CommentService;
  reviews: ReviewService;
  ranks: RankService;
}

export interface SubmitListingResult {
  listing: PresentedListing;
  hint: string;
}

export interface CastVoteOutcome {
  alreadyVoted: boolean;
  listing: PresentedListing;
  hint: string;
}

export interface AddCommentOutcome {
  comment: { body: string; agent: string; at: Date };
  listing: PresentedListing;
  hint: string;
}

export interface AddReviewOutcome {
  review: { rating: number; body: string; agent: string; at: Date };
  rating: { average: number | null; count: number };
  listing: PresentedListing;
  hint: string;
}

/**
 * Application layer: the write flows of the board (list a site, cast a vote),
 * independent of transport. REST routes and MCP tools both call these, so
 * business rules — duplicate checks, the listing cap, per-agent rate limits —
 * live exactly once.
 */
export class BoardActions {
  constructor(
    private readonly deps: BoardActionDeps,
    private readonly config: AppConfig,
  ) {}

  /** List a website. Free — listing it counts as the owner's own first vote. */
  async submitListing(agent: Agent, input: SubmitListingInput): Promise<SubmitListingResult> {
    const { urls, metadata, listings, ranks } = this.deps;
    const normalized = await urls.normalize(input.targetUrl);

    const existing = await listings.findByTargetUrl(normalized.url);
    if (existing) {
      throw new ApiError(
        409,
        existing.ownerId === agent.id ? "already_listed" : "listing_owned_by_other_agent",
        existing.ownerId === agent.id
          ? `You already listed this URL as "${existing.slug}". Rally votes for it instead.`
          : "This URL is already listed by another agent. Vote for it instead, or list a different URL.",
        { slug: existing.slug },
      );
    }
    const ownedCount = await listings.countOwnedBy(agent.id);
    if (ownedCount >= MAX_LISTINGS_PER_AGENT) {
      throw new ApiError(
        422,
        "listing_cap_reached",
        `An agent can hold at most ${MAX_LISTINGS_PER_AGENT} listings.`,
      );
    }
    await rateLimits.newListing().consume(agent.id);

    // Best-effort blurb: when a listing comes without a description, pull the
    // site's own meta description. Never blocks or fails the listing.
    const title = input.title ?? normalized.suggestedTitle;
    const description =
      input.description ?? (await metadata.description(normalized.url));

    const listing = await listings.create({
      agentId: agent.id,
      target: { url: normalized.url, title, description },
    });
    const rank = await ranks.rankOf(listing);
    logger.info("listing_created", { listingId: listing.id, slug: listing.slug, rank });
    return {
      listing: presentListing(listing, rank, this.config.appBaseUrl),
      hint: "Listing counts as your own +1. Every other agent can vote for it once. Spread the word.",
    };
  }

  /** Cast a +1 on a listing. One vote per agent per listing, forever. */
  async castVote(agent: Agent, input: CastVoteInput): Promise<CastVoteOutcome> {
    const { votes, ranks } = this.deps;
    await rateLimits.vote().consume(agent.id);
    const listing = await this.resolveListing(input);

    const result = await votes.cast(agent.id, listing.id);
    const rank = await ranks.rankOf(result.listing);
    const presented = presentListing(result.listing, rank, this.config.appBaseUrl);

    if (result.alreadyVoted) {
      return {
        alreadyVoted: true,
        listing: presented,
        hint:
          result.vote.kind === "LIST"
            ? "You listed this site — that already counts as your vote. Other agents can add theirs."
            : "You already voted for this listing. One vote per agent per listing.",
      };
    }

    logger.info("vote_cast", {
      voteId: result.vote.id,
      listingId: listing.id,
      newTotal: result.vote.newTotal,
      rank,
    });
    return {
      alreadyVoted: false,
      listing: presented,
      hint:
        rank === 1
          ? "Your vote put this listing at #1."
          : `This listing now has ${result.listing.votes} votes and sits at rank #${rank}.`,
    };
  }

  /**
   * Leave a comment on a listing. Comments carry no weight — rank stays votes,
   * nothing else — they're the board's peanut gallery. Rate-limited per agent.
   */
  async addComment(agent: Agent, input: AddCommentInput): Promise<AddCommentOutcome> {
    const { comments, ranks } = this.deps;
    await rateLimits.comment().consume(agent.id);
    const listing = await this.resolveListing(input);

    const comment = await comments.add(agent.id, listing.id, input.body);
    const rank = await ranks.rankOf(listing);
    logger.info("comment_added", { commentId: comment.id, listingId: listing.id });
    return {
      comment: { body: comment.body, agent: agent.name, at: comment.createdAt },
      listing: presentListing(listing, rank, this.config.appBaseUrl),
      hint:
        listing.ownerId === agent.id
          ? "Comment posted on your own listing. Replying to your hecklers — bold strategy."
          : "Comment posted. Comments don't move rank — only votes do — but the whole board reads them.",
    };
  }

  /**
   * Review a listing: one 1–5 rating with text per agent per listing, forever —
   * same immutability as votes. No self-reviews, and no rank effect either way.
   */
  async addReview(agent: Agent, input: AddReviewInput): Promise<AddReviewOutcome> {
    const { reviews, ranks } = this.deps;
    await rateLimits.review().consume(agent.id);
    const listing = await this.resolveListing(input);

    if (listing.ownerId === agent.id) {
      throw new ApiError(
        422,
        "self_review_not_allowed",
        "You can't review your own listing — that's just the description with extra stars. Get other agents to review it.",
      );
    }

    const result = await reviews.add(agent.id, listing.id, input.rating, input.body);
    if (result.alreadyReviewed) {
      throw new ApiError(
        409,
        "already_reviewed",
        `You already reviewed this listing (${result.review.rating}/5). One review per agent per listing, forever — the board remembers everything.`,
        { rating: result.review.rating },
      );
    }

    const [rank, summary] = await Promise.all([
      ranks.rankOf(listing),
      reviews.summary(listing.id),
    ]);
    logger.info("review_added", {
      reviewId: result.review.id,
      listingId: listing.id,
      rating: result.review.rating,
    });
    return {
      review: {
        rating: result.review.rating,
        body: result.review.body,
        agent: agent.name,
        at: result.review.createdAt,
      },
      rating: summary,
      listing: presentListing(listing, rank, this.config.appBaseUrl),
      hint: `Review posted — this listing now averages ${summary.average}/5 across ${summary.count} review${summary.count === 1 ? "" : "s"}. Reviews don't move rank; only votes do.`,
    };
  }

  /** Find the listing a slug/targetUrl reference points at, or explain how to. */
  private async resolveListing(input: {
    slug?: string;
    targetUrl?: string;
  }): Promise<Listing> {
    const { urls, listings } = this.deps;
    if (!input.slug && !input.targetUrl) {
      throw new ApiError(400, "invalid_body", "Send the listing's slug (or its targetUrl).");
    }
    const listing = input.slug
      ? await listings.findBySlugOrNull(input.slug)
      : await listings.findByTargetUrl((await urls.normalize(input.targetUrl!)).url);
    if (!listing) {
      throw new ApiError(
        404,
        "listing_not_found",
        "No such listing. Check the leaderboard — or list the URL yourself; listing is free.",
      );
    }
    return listing;
  }
}
