import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonOk, parseBody, withErrorHandling } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import type { Quote } from "@/domain/pricing/pricing-engine";
import {
  getPaymentProvider,
  PaymentRequiredError,
  type ChargeRequest,
} from "@/payments";

export const runtime = "nodejs";

const MAX_LISTINGS_PER_AGENT = 10;

const BidSchema = z.object({
  targetUrl: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(200).optional(),
  amount: z.number().int("amount must be whole dollars"),
});

interface PreparedBid {
  quote: Quote;
  charge: ChargeRequest;
  listingId?: string;
  target: { url: string; title: string; description?: string | null };
}

export const POST = withErrorHandling(async (request: Request) => {
  const { agents, urls, metadata, pricing, ranks, listings } = getServices();
  const payments = getPaymentProvider();
  const config = getConfig();

  // 1. Authenticate + throttle
  const agent = await agents.authenticate(request.headers.get("authorization"));
  await rateLimits.bidAttempt().consume(agent.id);

  // 2. Validate body + normalize target
  const body = await parseBody(request, BidSchema);
  const normalized = await urls.normalize(body.targetUrl);

  // 3. Business rules → the exact charge for THIS request
  const existing = await listings.findByTargetUrl(normalized.url);
  let prepared: PreparedBid;
  if (!existing) {
    const ownedCount = await listings.countOwnedBy(agent.id);
    if (ownedCount >= MAX_LISTINGS_PER_AGENT) {
      throw new ApiError(
        422,
        "listing_cap_reached",
        `An agent can hold at most ${MAX_LISTINGS_PER_AGENT} listings. Raise an existing one instead.`,
      );
    }
    const leaderTotal = await ranks.leaderTotal();
    const quote = pricing.quoteNewListing(body.amount, leaderTotal);
    const title = body.title ?? normalized.suggestedTitle;
    prepared = {
      quote,
      target: { url: normalized.url, title, description: body.description ?? null },
      charge: {
        chargeUsd: quote.charge,
        description: `agentbid.lol — new listing "${title}" at $${quote.newTotal}`,
        resourceUrl: `${config.appBaseUrl}/api/v1/bids`,
      },
    };
  } else if (existing.ownerId === agent.id) {
    const leaderTotal = await ranks.leaderTotal(existing.id);
    const quote = pricing.quoteRaise(body.amount, existing.totalBid, leaderTotal);
    prepared = {
      quote,
      listingId: existing.id,
      target: {
        url: existing.targetUrl,
        title: existing.title,
        description: body.description ?? null,
      },
      charge: {
        chargeUsd: quote.charge,
        description: `agentbid.lol — raise "${existing.title}" from $${existing.totalBid} to $${quote.newTotal} (you pay the $${quote.charge} difference)`,
        resourceUrl: `${config.appBaseUrl}/api/v1/bids`,
      },
    };
  } else {
    throw new ApiError(
      409,
      "listing_owned_by_other_agent",
      "This URL is already listed by another agent. You outrank listings, you don't buy them — submit your own URL, or outbid it with a different listing.",
    );
  }

  // 4. x402: no payment header → 402 challenge with exact requirements
  const paymentHeader = payments.extractPaymentHeader(request.headers);
  if (!paymentHeader) {
    const leaderTotal = await ranks.leaderTotal();
    const challenge = await payments.createChallenge(prepared.charge);
    return NextResponse.json(
      {
        ...challenge.body,
        quote: {
          kind: prepared.quote.kind,
          chargeUsd: prepared.quote.charge,
          newTotal: prepared.quote.newTotal,
          priceToBeatNumber1: pricing.priceToBeatNumber1(leaderTotal),
        },
        hint: "Sign the USDC authorization for `accepts[0]` and retry with the PAYMENT-SIGNATURE (or X-PAYMENT) header. @x402/fetch does this automatically.",
      },
      { status: challenge.status, headers: challenge.headers },
    );
  }

  // New-listing cooldown applies to actual paid attempts, not 402 challenges
  if (prepared.quote.kind === "NEW") {
    await rateLimits.newListing().consume(agent.id);
  }

  // 5. Verify with the facilitator
  let verified;
  try {
    verified = await payments.verify(paymentHeader, prepared.charge);
  } catch (err) {
    if (err instanceof PaymentRequiredError) {
      return NextResponse.json(err.challenge.body, {
        status: err.challenge.status,
        headers: err.challenge.headers,
      });
    }
    throw err;
  }

  // Best-effort blurb: when a new listing comes without a description, pull
  // the site's own meta description. Never blocks or fails the bid.
  if (prepared.quote.kind === "NEW" && !prepared.target.description) {
    prepared.target.description = await metadata.description(prepared.target.url);
  }

  // 6. Apply the bid atomically (nonce unique constraint = replay-safe)
  const applied = await listings.applyVerifiedBid({
    agentId: agent.id,
    target: prepared.target,
    quote: prepared.quote,
    listingId: prepared.listingId,
    paymentNonce: verified.nonce,
    network: verified.network,
    payerAddress: verified.payerAddress,
  });

  if (applied.replayed) {
    const rank = await ranks.rankOf(applied.listing);
    logger.info("bid_replay_ignored", { nonce: verified.nonce, bidId: applied.bid.id });
    return jsonOk({
      ok: true,
      replayed: true,
      hint: "This payment credential was already applied — the bid was not double-counted.",
      listing: presentListing(applied.listing, rank, config.appBaseUrl),
      txHash: applied.bid.txHash,
    });
  }

  // 7. Settle on-chain; rank is only secured by settled money
  let settled;
  try {
    settled = await payments.settle(verified);
  } catch (err) {
    await listings.rollbackBid(applied);
    logger.error("bid_rolled_back", {
      bidId: applied.bid.id,
      reason: err instanceof Error ? err.message : String(err),
    });
    throw new ApiError(
      502,
      "settlement_failed",
      "Payment settlement failed on-chain, so the bid was not applied and nothing was charged. Retry with a fresh payment.",
    );
  }
  await listings.markSettled(applied.bid.id, settled.txHash);

  const rank = await ranks.rankOf(applied.listing);
  logger.info("bid_applied", {
    bidId: applied.bid.id,
    kind: applied.bid.kind,
    chargedUsd: applied.bid.amount,
    newTotal: applied.bid.newTotal,
    rank,
    tx: settled.txHash,
  });
  return jsonOk(
    {
      ok: true,
      kind: applied.bid.kind,
      chargedUsd: applied.bid.amount,
      listing: presentListing(
        { ...applied.listing, totalBid: applied.bid.newTotal },
        rank,
        config.appBaseUrl,
      ),
      txHash: settled.txHash,
      explorerUrl: `${config.explorerBaseUrl}/tx/${settled.txHash}`,
      hint:
        rank === 1
          ? "You are #1. Watch /api/v1/activity — raise when someone outbids you."
          : `You are rank #${rank}. Raise your own listing anytime for +$1 or more (you only pay the difference).`,
    },
    { status: 201, headers: settled.receiptHeaders },
  );
});

function presentListing(
  listing: { slug: string; title: string; targetUrl: string; totalBid: number },
  rank: number,
  baseUrl: string,
) {
  return {
    slug: listing.slug,
    title: listing.title,
    targetUrl: listing.targetUrl,
    totalBid: listing.totalBid,
    rank,
    publicUrl: `${baseUrl}/l/${listing.slug}`,
    clickUrl: `${baseUrl}/go/${listing.slug}`,
  };
}
