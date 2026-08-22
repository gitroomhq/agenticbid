/**
 * Reconciliation: cross-check every settled Bid row against the chain.
 * For each bid with a txHash, verify the transaction succeeded and contains a
 * USDC Transfer of exactly `amount` dollars to PAYTO_ADDRESS.
 *
 * Run: npx tsx scripts/reconcile.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createPublicClient, http, parseEventLogs, erc20Abi } from "viem";
import { base, baseSepolia } from "viem/chains";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const USDC: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

async function main() {
  const payTo = process.env.PAYTO_ADDRESS?.toLowerCase();
  if (!payTo) throw new Error("PAYTO_ADDRESS missing");
  const network = process.env.X402_NETWORK ?? "base-sepolia";
  const chain = createPublicClient({
    chain: network === "base" ? base : baseSepolia,
    transport: http(),
  });
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const bids = await db.bid.findMany({
    where: { network, txHash: { not: null }, paymentNonce: { not: { startsWith: "0xseed" } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`checking ${bids.length} settled bids on ${network}...`);

  let bad = 0;
  for (const bid of bids) {
    try {
      const receipt = await chain.getTransactionReceipt({ hash: bid.txHash as `0x${string}` });
      if (receipt.status !== "success") throw new Error("tx reverted");
      const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
      const match = transfers.find(
        (log) =>
          log.address.toLowerCase() === USDC[network].toLowerCase() &&
          log.args.to?.toLowerCase() === payTo &&
          log.args.value === BigInt(bid.amount) * 1_000_000n,
      );
      if (!match) throw new Error(`no USDC transfer of $${bid.amount} to payTo in tx`);
      console.log(`  ✅ ${bid.id} $${bid.amount} ${bid.txHash}`);
    } catch (err) {
      bad += 1;
      console.error(`  ❌ ${bid.id} $${bid.amount} ${bid.txHash}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const unsettled = await db.bid.count({
    where: { network, txHash: null, paymentNonce: { not: { startsWith: "0xseed" } } },
  });
  if (unsettled > 0) console.warn(`⚠️  ${unsettled} bids have no txHash (should be none — rollbacks delete)`);
  console.log(bad === 0 ? "\n🎉 ledger matches the chain" : `\n❌ ${bad} mismatches`);
  await db.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
