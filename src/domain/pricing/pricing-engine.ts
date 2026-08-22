import { ApiError } from "@/lib/errors";

/**
 * Pure implementation of the board's money rules:
 * - New listings: whole dollars, $5 minimum, $999,999 cap.
 * - Taking #1 requires at least leader + $5; amounts strictly between the
 *   leader and leader + $5 are rejected (you may tie the leader instead —
 *   older bid keeps the higher rank).
 * - Raising your own listing: new bid >= current + $1, you pay the difference.
 * - No refunds; nothing here ever produces a negative charge.
 */
export const PRICING = {
  MIN_NEW_BID: 5,
  MAX_BID: 999_999,
  MIN_RAISE_DELTA: 1,
  TAKE_LEAD_DELTA: 5,
} as const;

export interface Quote {
  /** Dollars charged for this transaction (delta on raises). */
  charge: number;
  /** Listing total after the bid completes. */
  newTotal: number;
  kind: "NEW" | "RAISE";
}

export class PricingEngine {
  /** Minimum bid that currently takes #1. */
  priceToBeatNumber1(leaderTotal: number | null): number {
    if (leaderTotal === null) return PRICING.MIN_NEW_BID;
    return leaderTotal + PRICING.TAKE_LEAD_DELTA;
  }

  /**
   * Quote a bid on a brand-new listing.
   *
   * @param amount - Requested total bid in whole dollars
   * @param leaderTotal - Current #1 total (null when the board is empty)
   */
  quoteNewListing(amount: number, leaderTotal: number | null): Quote {
    this.assertWholeDollars(amount);
    if (amount < PRICING.MIN_NEW_BID) {
      throw new ApiError(422, "amount_below_minimum", `New listings start at $${PRICING.MIN_NEW_BID}.`, {
        minimum: PRICING.MIN_NEW_BID,
      });
    }
    this.assertCap(amount);
    this.assertNotInDeadZone(amount, leaderTotal);
    return { charge: amount, newTotal: amount, kind: "NEW" };
  }

  /**
   * Quote a raise on the caller's own listing. Only the difference is charged.
   *
   * @param amount - Requested NEW total in whole dollars
   * @param currentTotal - The listing's current total bid
   * @param leaderTotal - Current #1 total among OTHER listings (null when none)
   */
  quoteRaise(amount: number, currentTotal: number, leaderTotal: number | null): Quote {
    this.assertWholeDollars(amount);
    if (amount < currentTotal + PRICING.MIN_RAISE_DELTA) {
      throw new ApiError(
        422,
        "raise_too_small",
        `A raise must exceed your current bid of $${currentTotal} by at least $${PRICING.MIN_RAISE_DELTA}.`,
        { currentTotal, minimumNewTotal: currentTotal + PRICING.MIN_RAISE_DELTA },
      );
    }
    this.assertCap(amount);
    this.assertNotInDeadZone(amount, leaderTotal);
    return { charge: amount - currentTotal, newTotal: amount, kind: "RAISE" };
  }

  private assertWholeDollars(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new ApiError(422, "amount_not_integer", "Bids are whole US dollars ($1 increments).");
    }
  }

  private assertCap(amount: number): void {
    if (amount > PRICING.MAX_BID) {
      throw new ApiError(422, "amount_above_maximum", `The maximum bid is $${PRICING.MAX_BID.toLocaleString("en-US")}.`, {
        maximum: PRICING.MAX_BID,
      });
    }
  }

  /**
   * Rejects amounts that would pass the current leader without paying the
   * take-the-lead premium. Tying the leader is allowed (older bid outranks).
   */
  private assertNotInDeadZone(amount: number, leaderTotal: number | null): void {
    if (leaderTotal === null) return;
    const takeLead = leaderTotal + PRICING.TAKE_LEAD_DELTA;
    if (amount > leaderTotal && amount < takeLead) {
      throw new ApiError(
        422,
        "lead_premium_required",
        `Taking #1 requires at least $${takeLead} (leader + $${PRICING.TAKE_LEAD_DELTA}). Bid $${takeLead}+ to take the lead, or $${leaderTotal} or less for a lower rank.`,
        { leaderTotal, priceToBeatNumber1: takeLead },
      );
    }
  }
}
