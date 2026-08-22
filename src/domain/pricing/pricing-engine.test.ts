import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { PricingEngine, PRICING } from "./pricing-engine";
import { compareForRank } from "@/domain/ranking/rank-service";

const engine = new PricingEngine();

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
  throw new Error("expected an ApiError");
}

describe("new listings", () => {
  it("accepts the $5 minimum on an empty board", () => {
    expect(engine.quoteNewListing(5, null)).toEqual({ charge: 5, newTotal: 5, kind: "NEW" });
  });

  it("rejects below the minimum", () => {
    expect(codeOf(() => engine.quoteNewListing(4, null))).toBe("amount_below_minimum");
  });

  it("rejects non-integer and non-positive amounts", () => {
    expect(codeOf(() => engine.quoteNewListing(5.5, null))).toBe("amount_not_integer");
    expect(codeOf(() => engine.quoteNewListing(0, null))).toBe("amount_not_integer");
    expect(codeOf(() => engine.quoteNewListing(-5, null))).toBe("amount_not_integer");
  });

  it("rejects above the cap", () => {
    expect(codeOf(() => engine.quoteNewListing(PRICING.MAX_BID + 1, null))).toBe(
      "amount_above_maximum",
    );
    expect(engine.quoteNewListing(PRICING.MAX_BID, null).charge).toBe(PRICING.MAX_BID);
  });

  it("requires leader + $5 to take #1", () => {
    // leader at $100: 101..104 are rejected, 100 ties, 105 takes the lead
    expect(codeOf(() => engine.quoteNewListing(101, 100))).toBe("lead_premium_required");
    expect(codeOf(() => engine.quoteNewListing(104, 100))).toBe("lead_premium_required");
    expect(engine.quoteNewListing(100, 100).newTotal).toBe(100);
    expect(engine.quoteNewListing(105, 100).newTotal).toBe(105);
  });

  it("lands lower ranks without the premium", () => {
    expect(engine.quoteNewListing(50, 100).newTotal).toBe(50);
  });
});

describe("raises", () => {
  it("charges only the difference", () => {
    expect(engine.quoteRaise(12, 10, null)).toEqual({ charge: 2, newTotal: 12, kind: "RAISE" });
  });

  it("requires at least +$1 over the current bid", () => {
    expect(codeOf(() => engine.quoteRaise(10, 10, null))).toBe("raise_too_small");
    expect(engine.quoteRaise(11, 10, null).charge).toBe(1);
  });

  it("applies the take-the-lead premium against other listings", () => {
    // own listing at $10, another leader at $100
    expect(codeOf(() => engine.quoteRaise(102, 10, 100))).toBe("lead_premium_required");
    expect(engine.quoteRaise(105, 10, 100).charge).toBe(95);
  });

  it("lets the current leader raise freely by $1", () => {
    // caller IS the leader, so leaderTotal (others) is below their own total
    expect(engine.quoteRaise(101, 100, 50).charge).toBe(1);
  });
});

describe("priceToBeatNumber1", () => {
  it("is $5 on an empty board", () => {
    expect(engine.priceToBeatNumber1(null)).toBe(5);
  });
  it("is leader + $5 otherwise", () => {
    expect(engine.priceToBeatNumber1(120)).toBe(125);
  });
});

describe("tie-breaking", () => {
  it("orders by total desc, then older first bid, then id", () => {
    const early = new Date("2026-01-01T00:00:00Z");
    const late = new Date("2026-02-01T00:00:00Z");
    const rows = [
      { id: "c", totalBid: 10, firstBidAt: late },
      { id: "a", totalBid: 10, firstBidAt: early },
      { id: "b", totalBid: 20, firstBidAt: late },
      { id: "d", totalBid: 10, firstBidAt: early },
    ];
    const sorted = [...rows].sort(compareForRank).map((row) => row.id);
    // b leads on amount; a beats d only via id tiebreak (same instant); c is last
    expect(sorted).toEqual(["b", "a", "d", "c"]);
  });
});
