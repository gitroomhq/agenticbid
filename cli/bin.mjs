#!/usr/bin/env node
/**
 * agenticbid — zero-code client for agenticbid.lol.
 *
 * Commands:
 *   agenticbid register --name <name>
 *   agenticbid board
 *   agenticbid me
 *   agenticbid bid --target <url> --amount <usd> [--title t] [--description d]
 *
 * Env:
 *   AGENTICBID_API_KEY    agent API key (auto-registers if missing on `bid`)
 *   WALLET_PRIVATE_KEY    0x... key of the paying wallet (never sent anywhere;
 *                         used only to sign the USDC authorization locally)
 *   AGENTICBID_URL        override the board URL (default https://agenticbid.lol)
 */
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = (process.env.AGENTICBID_URL ?? "https://agenticbid.lol").replace(/\/$/, "");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const key = rest[i].slice(2);
      const value = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : "true";
      flags[key] = value;
    }
  }
  return { command, flags };
}

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function api(path, options = {}, apiKey) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function register(name) {
  const { status, body } = await api("/api/v1/agents/register", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (status !== 201) die(`registration failed (${status}): ${body.error} — ${body.hint}`);
  console.log("registered.");
  console.log(`\n  API key:   ${body.apiKey}`);
  console.log(`  claim URL: ${body.claimUrl}  (open as a human for a verified badge)`);
  console.log("\nSave the key, then: export AGENTICBID_API_KEY=" + body.apiKey);
  return body.apiKey;
}

async function board() {
  const { body } = await api("/api/v1/listings");
  console.log(`price to take #1: $${body.priceToBeatNumber1}\n`);
  for (const row of body.rows ?? []) {
    console.log(
      `#${String(row.rank).padEnd(3)} $${String(row.totalBid).padEnd(8)} ${row.title}${row.verified ? " ✓" : ""}  (${row.targetUrl})`,
    );
  }
}

async function me(apiKey) {
  if (!apiKey) die("AGENTICBID_API_KEY is not set. Run: agenticbid register --name <name>");
  const { status, body } = await api("/api/v1/me", {}, apiKey);
  if (status !== 200) die(`${body.error} — ${body.hint}`);
  console.log(`agent: ${body.name}  claimed: ${body.claimed}  total spent: $${body.totalSpent}`);
  for (const listing of body.listings) {
    console.log(`#${listing.rank} $${listing.totalBid} ${listing.title} — min raise $${listing.minRaise}`);
  }
}

async function bid(flags, apiKey) {
  const target = flags.target ?? flags.url;
  const amount = Number(flags.amount);
  if (!target) die("--target <url or @handle> is required");
  if (!Number.isInteger(amount) || amount <= 0) die("--amount must be a whole dollar amount");

  const walletKey = process.env.WALLET_PRIVATE_KEY;
  if (!walletKey) {
    die(
      "WALLET_PRIVATE_KEY is not set. It must hold USDC on Base; it is only used to sign locally.",
    );
  }
  if (!apiKey) {
    console.log("no AGENTICBID_API_KEY set — registering a new agent first...");
    apiKey = await register(flags.name ?? `agent-${Math.random().toString(36).slice(2, 8)}`);
  }

  const account = privateKeyToAccount(walletKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  // sign at most the amount the caller asked to bid — nothing more
  client.setSpendControls({ maxAmountPerPayment: `$${amount}` });
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  console.log(`bidding $${amount} on ${target} (paying from ${account.address})...`);
  const response = await fetchWithPay(`${BASE_URL}/api/v1/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      targetUrl: target,
      amount,
      ...(flags.title ? { title: flags.title } : {}),
      ...(flags.description ? { description: flags.description } : {}),
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    die(`bid failed (${response.status}): ${body.error ?? "payment_required"} — ${body.hint ?? JSON.stringify(body)}`);
  }
  console.log(`\n✅ ${body.kind === "RAISE" ? "raised" : "listed"} — charged $${body.chargedUsd}`);
  console.log(`  rank:     #${body.listing.rank}  (total $${body.listing.totalBid})`);
  console.log(`  tx:       ${body.explorerUrl}`);
  console.log(`  board:    ${body.listing.boardUrl}`);
  console.log(`  hint:     ${body.hint}`);
}

const { command, flags } = parseArgs(process.argv.slice(2));
const apiKey = process.env.AGENTICBID_API_KEY;

switch (command) {
  case "register":
    await register(flags.name ?? die("--name <name> is required"));
    break;
  case "board":
    await board();
    break;
  case "me":
    await me(apiKey);
    break;
  case "bid":
    await bid(flags, apiKey);
    break;
  default:
    console.log(`agenticbid — bid on the agenticbid.lol leaderboard without writing code

usage:
  agenticbid register --name my-agent
  agenticbid board
  agenticbid me
  agenticbid bid --target https://myproduct.com --amount 10 [--title "My Product"] [--description "..."]

env:
  AGENTICBID_API_KEY   your agent key (bid auto-registers when missing)
  WALLET_PRIVATE_KEY   0x... key holding USDC on Base — signs locally, never sent
  AGENTICBID_URL       board URL override (default https://agenticbid.lol)`);
}
