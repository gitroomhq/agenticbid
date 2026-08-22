/**
 * End-to-end x402 bid roundtrip against a running dev server.
 *
 * Prereqs:
 *   - `npm run dev` in another terminal
 *   - TEST_PAYER_PRIVATE_KEY funded with Base Sepolia ETH + USDC
 *     (https://faucet.circle.com — network: Base Sepolia)
 *
 * Run: npx tsx scripts/test-bid.ts
 *
 * Covers:
 *   1. agent registration
 *   2. reading the board
 *   3. 402 challenge inspection (no payment header)
 *   4. paid bid via @x402/fetch (auto 402 → sign → retry)
 *   5. idempotency: replaying the exact same payment credential
 *   6. a raise paying only the difference
 *   7. negative: tampered body with a stale payment credential
 *   8. USDC balance delta at PAYTO_ADDRESS
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, erc20Abi, http } from "viem";
import { baseSepolia } from "viem/chains";

const BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`✅ ${message}`);
}

async function main() {
  const key = process.env.TEST_PAYER_PRIVATE_KEY;
  const payTo = process.env.PAYTO_ADDRESS;
  if (!key || !payTo) fail("TEST_PAYER_PRIVATE_KEY / PAYTO_ADDRESS missing from .env.local");

  const account = privateKeyToAccount(key as `0x${string}`);
  const chain = createPublicClient({ chain: baseSepolia, transport: http() });

  const [eth, usdc] = await Promise.all([
    chain.getBalance({ address: account.address }),
    chain.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);
  console.log(`payer ${account.address}: ${eth} wei ETH, ${Number(usdc) / 1e6} USDC`);
  if (usdc < 20_000_000n) {
    fail(
      `Test payer needs at least 20 USDC on Base Sepolia. Fund ${account.address} at https://faucet.circle.com`,
    );
  }
  const payToBalanceBefore = (await chain.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payTo as `0x${string}`],
  })) as bigint;

  // 1. register
  const registered = await fetch(`${BASE_URL}/api/v1/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `test-agent-${Date.now() % 100000}` }),
  }).then((r) => r.json());
  if (!registered.apiKey) fail(`registration failed: ${JSON.stringify(registered)}`);
  ok(`registered agent ${registered.name}`);
  const auth = { Authorization: `Bearer ${registered.apiKey}` };

  // 2. read the board
  const board = await fetch(`${BASE_URL}/api/v1/listings`).then((r) => r.json());
  ok(`board has ${board.rows.length} listings; price to beat #1: $${board.priceToBeatNumber1}`);

  const targetUrl = `https://e2e-test-${Date.now()}.example.com`;
  const bidBody = { targetUrl, title: "E2E Test Listing", amount: 5 };

  // 3. raw 402 challenge
  const challenge = await fetch(`${BASE_URL}/api/v1/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(bidBody),
  });
  if (challenge.status !== 402) fail(`expected 402, got ${challenge.status}`);
  const challengeBody = await challenge.json();
  const accepted = challengeBody.accepts?.[0];
  if (accepted?.amount !== "5000000") fail(`expected 5000000 atomic USDC, got ${accepted?.amount}`);
  if (accepted.payTo.toLowerCase() !== payTo.toLowerCase()) fail("402 payTo mismatch");
  ok(`402 challenge: $${challengeBody.quote.chargeUsd} → ${accepted.amount} atomic USDC on ${accepted.network}`);

  // 4. paid bid — spy on the outgoing retry to capture the payment header
  let capturedPaymentHeader: string | null = null;
  const spyFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const sig = headers.get("payment-signature") ?? headers.get("x-payment");
    if (sig) capturedPaymentHeader = sig;
    return fetch(input, init);
  };
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  // the SDK's default spend cap is $1/payment; this test pays $5 then $2
  client.setSpendControls({ maxAmountPerPayment: "$10" });
  const fetchWithPay = wrapFetchWithPayment(spyFetch, client);

  const paid = await fetchWithPay(`${BASE_URL}/api/v1/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(bidBody),
  });
  const paidBody = await paid.json();
  if (paid.status !== 201 || !paidBody.ok) fail(`paid bid failed (${paid.status}): ${JSON.stringify(paidBody)}`);
  if (!paidBody.txHash) fail("no txHash in response");
  ok(`bid applied: rank #${paidBody.listing.rank}, tx ${paidBody.txHash}`);
  console.log(`   explorer: ${paidBody.explorerUrl}`);
  if (!paid.headers.get("x-payment-response")) fail("missing X-PAYMENT-RESPONSE receipt header");
  ok("X-PAYMENT-RESPONSE receipt header present");

  // 5. idempotency — replay the exact same credential
  if (!capturedPaymentHeader) fail("spy did not capture the payment header");
  const replay = await fetch(`${BASE_URL}/api/v1/bids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": capturedPaymentHeader,
      ...auth,
    },
    body: JSON.stringify(bidBody),
  });
  const replayBody = await replay.json();
  if (!replayBody.replayed) fail(`replay was not detected: ${JSON.stringify(replayBody)}`);
  ok("replayed credential detected — bid not double-counted");

  // 6. raise: $5 → $7, charged $2
  const raise = await fetchWithPay(`${BASE_URL}/api/v1/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ targetUrl, amount: 7 }),
  });
  const raiseBody = await raise.json();
  if (raiseBody.kind !== "RAISE" || raiseBody.chargedUsd !== 2) {
    fail(`raise mismatch: ${JSON.stringify(raiseBody)}`);
  }
  ok(`raise applied: charged $${raiseBody.chargedUsd}, total $${raiseBody.listing.totalBid}`);

  // 7. negative: stale credential ($5) against a different charge ($9 raise)
  const tampered = await fetch(`${BASE_URL}/api/v1/bids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": capturedPaymentHeader,
      ...auth,
    },
    body: JSON.stringify({ targetUrl, amount: 9 }),
  });
  if (tampered.status !== 402) fail(`tampered request: expected 402, got ${tampered.status}`);
  ok("mismatched credential correctly rejected with a fresh 402");

  // 8. money actually arrived
  const payToBalanceAfter = (await chain.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payTo as `0x${string}`],
  })) as bigint;
  const delta = Number(payToBalanceAfter - payToBalanceBefore) / 1e6;
  if (delta < 7) fail(`expected >= 7 USDC at payTo, saw delta ${delta}`);
  ok(`USDC landed at PAYTO_ADDRESS: +$${delta}`);

  console.log("\n🎉 full x402 roundtrip passed");
}

main().catch((err) => fail(err?.stack ?? String(err)));
