#!/usr/bin/env node
/**
 * bidding — zero-code client for bidding.dev.
 *
 * Commands:
 *   bidding wallet set            save your wallet key once (encrypted vault)
 *   bidding wallet show           show the stored wallet's address
 *   bidding wallet clear          remove the stored wallet key
 *   bidding register --name <n>   register an agent (API key auto-saved)
 *   bidding board                 read the leaderboard
 *   bidding me                    your listings and ranks
 *   bidding bid --target <url> --amount <usd> [--title t] [--description d]
 *   bidding budget --set <usd>    standing spend ceiling (interactive terminal only)
 *
 * Every charge requires human approval: live (a y/N prompt at a terminal,
 * shown the exact quote before anything is signed) or standing (a budget a
 * human set at a terminal). Headless runs — agent harnesses, CI, cron have
 * no TTY — cannot set or raise budgets and cannot bid without one.
 *
 * Credentials resolve env-first, then the vault (~/.bidding/):
 *   BIDDING_API_KEY    agent API key (register/bid save it to the vault)
 *   WALLET_PRIVATE_KEY    0x... payer key — only ever used to sign locally
 *   BIDDING_URL        override the board URL (default https://bidding.dev)
 */
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL = (process.env.BIDDING_URL ?? "https://bidding.dev").replace(/\/$/, "");

// "A human is present" means an interactive terminal on both ends. Agent
// harnesses (Claude Code, CI, cron) run commands without a TTY, so nothing
// that grants spending authority can execute there.
const IS_TTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const HUMAN_APPROVAL_HINT =
  "human_approval_required — this needs a human at an interactive terminal. " +
  "Agents: show your human the exact command and let them run it themselves.";

// ---------------------------------------------------------------------------
// Encrypted credential vault (~/.bidding/)
//
// vault.json is AES-256-GCM encrypted with a random key kept in vault.key
// (both chmod 600). This protects the wallet key from accidental exposure —
// shell history, env dumps, transcripts, copied config files. Someone with
// full read access to BOTH files can decrypt; for real treasury keys use a
// hardware wallet and fund this one with only what you intend to spend.
// ---------------------------------------------------------------------------

const VAULT_DIR = join(homedir(), ".bidding");
const VAULT_FILE = join(VAULT_DIR, "vault.json");
const VAULT_KEY_FILE = join(VAULT_DIR, "vault.key");

function vaultKey() {
  if (!existsSync(VAULT_KEY_FILE)) {
    mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(VAULT_KEY_FILE, randomBytes(32).toString("hex"), { mode: 0o600 });
    chmodSync(VAULT_KEY_FILE, 0o600);
  }
  return Buffer.from(readFileSync(VAULT_KEY_FILE, "utf8").trim(), "hex");
}

function readVault() {
  if (!existsSync(VAULT_FILE)) return {};
  try {
    const { iv, tag, data } = JSON.parse(readFileSync(VAULT_FILE, "utf8"));
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return {}; // corrupted or key rotated — treat as empty
  }
}

function writeVault(contents) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(contents), "utf8"), cipher.final()]);
  mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    VAULT_FILE,
    JSON.stringify({ iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), data: data.toString("hex") }),
    { mode: 0o600 },
  );
  chmodSync(VAULT_FILE, 0o600);
}

/** Read a secret from a pipe, or an echo-hidden interactive prompt. */
async function promptSecret(question) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const finish = (result) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      result === null ? process.exit(130) : resolve(result.trim());
    };
    // raw mode delivers keystrokes (or whole pastes) as chunks with no echo
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") return finish(value);
        if (char === "\u0003") return finish(null); // Ctrl+C
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.on("data", onData);
  });
}

/** Ask the human at the terminal for an explicit yes. Call only when IS_TTY. */
async function confirmHuman(question) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    return /^y(es)?$/i.test(answer);
  } catch {
    return false; // Ctrl+D / closed input is never approval
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, subcommand, ...maybeFlags] = argv;
  const rest = command === "wallet" ? maybeFlags : [subcommand, ...maybeFlags].filter((a) => a !== undefined);
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (typeof rest[i] === "string" && rest[i].startsWith("--")) {
      const key = rest[i].slice(2);
      const value = rest[i + 1] && !String(rest[i + 1]).startsWith("--") ? rest[++i] : "true";
      flags[key] = value;
    }
  }
  return { command, subcommand, flags };
}

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function getApiKey() {
  return process.env.BIDDING_API_KEY ?? readVault().apiKey ?? null;
}

function getWalletKey() {
  return process.env.WALLET_PRIVATE_KEY ?? readVault().walletPrivateKey ?? null;
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

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

function setBudget(vault, flags) {
  if (flags.budget === undefined) return vault;
  if (!IS_TTY) die(`${HUMAN_APPROVAL_HINT} (setting a budget grants standing spending authority)`);
  const budget = Number(flags.budget);
  if (!Number.isInteger(budget) || budget <= 0) die("--budget must be a whole dollar amount");
  return { ...vault, budgetUsd: budget, spentUsd: vault.spentUsd ?? 0 };
}

async function budgetCommand(flags) {
  const vault = readVault();
  if (flags.set) {
    if (!IS_TTY) die(`${HUMAN_APPROVAL_HINT} (setting a budget grants standing spending authority)`);
    const budget = Number(flags.set);
    if (!Number.isInteger(budget) || budget <= 0) die("--set must be a whole dollar amount");
    writeVault({ ...vault, budgetUsd: budget, spentUsd: vault.spentUsd ?? 0 });
    console.log(`budget set to $${budget} total (spent so far: $${vault.spentUsd ?? 0}).`);
    return;
  }
  if (vault.budgetUsd === undefined) {
    console.log("no budget set — bids are limited only by wallet balance. Set one: bidding budget --set 50");
    return;
  }
  console.log(`budget: $${vault.budgetUsd} total, spent $${vault.spentUsd ?? 0}, remaining $${vault.budgetUsd - (vault.spentUsd ?? 0)}`);
}

async function walletCommand(subcommand, flags) {
  const vault = readVault();
  if (subcommand === "new") {
    if (vault.walletPrivateKey && flags.force !== "true") {
      const existing = privateKeyToAccount(vault.walletPrivateKey).address;
      die(
        `a wallet is already stored (${existing}). Pass --force to replace it — funds at the old address stay at the old address.`,
      );
    }
    const key = generatePrivateKey();
    const address = privateKeyToAccount(key).address;
    writeVault(setBudget({ ...vault, walletPrivateKey: key }, flags));
    console.log("✅ new bidding wallet generated on this machine and saved (encrypted).");
    console.log(`\n  address: ${address}`);
    console.log(`\nFund it with only what you intend to spend:`);
    console.log("  - test board:  free USDC at https://faucet.circle.com (network: Base Sepolia)");
    console.log("  - production:  send USDC on the Base network to the address above");
    console.log("\nThe key was never displayed and never leaves this machine.");
  } else if (subcommand === "set") {
    const key = await promptSecret("paste your wallet private key (hidden): ");
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      die("that doesn't look like a private key (expected 0x + 64 hex characters)");
    }
    const address = privateKeyToAccount(key).address;
    writeVault({ ...vault, walletPrivateKey: key });
    console.log(`✅ wallet saved (encrypted) to ${VAULT_FILE}`);
    console.log(`   address: ${address}`);
    console.log("   you never need to set WALLET_PRIVATE_KEY again on this machine.");
  } else if (subcommand === "show") {
    const key = getWalletKey();
    if (!key) die("no wallet stored. Run: bidding wallet set");
    console.log(`address: ${privateKeyToAccount(key).address}`);
    console.log(`stored:  ${readVault().walletPrivateKey ? VAULT_FILE : "WALLET_PRIVATE_KEY env var"}`);
  } else if (subcommand === "clear") {
    delete vault.walletPrivateKey;
    writeVault(vault);
    console.log("wallet key removed from the vault.");
  } else {
    die("usage: bidding wallet <new|set|show|clear>");
  }
}

async function register(name) {
  const { status, body } = await api("/api/v1/agents/register", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (status !== 201) die(`registration failed (${status}): ${body.error} — ${body.hint}`);
  writeVault({ ...readVault(), apiKey: body.apiKey });
  console.log("registered.");
  console.log(`\n  API key:   ${body.apiKey}`);
  console.log(`  claim URL: ${body.claimUrl}  (open as a human for a verified badge)`);
  console.log(`\nThe key was saved (encrypted) to ${VAULT_FILE} — future commands just work.`);
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

async function me() {
  const apiKey = getApiKey();
  if (!apiKey) die("no API key. Run: bidding register --name <name>");
  const { status, body } = await api("/api/v1/me", {}, apiKey);
  if (status !== 200) die(`${body.error} — ${body.hint}`);
  console.log(`agent: ${body.name}  claimed: ${body.claimed}  total spent: $${body.totalSpent}`);
  for (const listing of body.listings) {
    console.log(`#${listing.rank} $${listing.totalBid} ${listing.title} — min raise $${listing.minRaise}`);
  }
}

async function bid(flags) {
  const target = flags.target ?? flags.url;
  const amount = Number(flags.amount);
  if (!target) die("--target <url or @handle> is required");
  if (!Number.isInteger(amount) || amount <= 0) die("--amount must be a whole dollar amount");

  let apiKey = getApiKey();
  if (!apiKey && flags.quote === "true") die("no API key. Run: bidding register --name <name>");
  if (!apiKey) {
    console.log("no API key found — registering a new agent first...");
    apiKey = await register(flags.name ?? `agent-${Math.random().toString(36).slice(2, 8)}`);
  }

  // Always fetch the exact quote before anything is signed, so approval —
  // live or standing — is over the real charge, not the requested total.
  const { status, body: quoteBody } = await api(
    "/api/v1/bids",
    { method: "POST", body: JSON.stringify({ targetUrl: target, amount }) },
    apiKey,
  );
  if (status !== 402) die(`${quoteBody.error} — ${quoteBody.hint}`);
  const quote = quoteBody.quote;

  if (flags.quote === "true") {
    console.log(`quote (nothing signed, nothing paid):`);
    console.log(`  kind:      ${quote.kind}`);
    console.log(`  charge:    $${quote.chargeUsd}`);
    console.log(`  new total: $${quote.newTotal}`);
    console.log(`  to beat #1: $${quote.priceToBeatNumber1}`);
    return;
  }

  const charge = Number(quote.chargeUsd);
  if (!Number.isInteger(charge) || charge <= 0) die(`unexpected quote from server: ${JSON.stringify(quote)}`);

  // hard budget cap: the human's total spend ceiling, enforced cumulatively
  const vault = readVault();
  if (vault.budgetUsd !== undefined) {
    const spent = vault.spentUsd ?? 0;
    if (spent + charge > vault.budgetUsd) {
      die(
        `this bid (charge $${charge}) would exceed the budget: $${spent} spent of $${vault.budgetUsd} total. ` +
          `A human can raise it with: bidding budget --set <usd>`,
      );
    }
  }

  // Human approval for every charge: live (y/N at a terminal) or standing
  // (a budget a human set at a terminal — budgets can't be created headless).
  if (IS_TTY) {
    console.log(`about to bid on ${target}:`);
    console.log(`  charge:    $${charge}${quote.kind === "RAISE" ? `  (raise to $${quote.newTotal} total)` : ""}`);
    if (!(await confirmHuman(`approve this $${charge} USDC charge? [y/N] `))) {
      die("cancelled — nothing signed, nothing paid");
    }
  } else if (vault.budgetUsd === undefined) {
    die(
      `${HUMAN_APPROVAL_HINT} Headless bids need a standing budget: ask your human to run ` +
        `"npx -y bidding budget --set <usd>" at a terminal (this bid would charge $${charge}), ` +
        `then rerun this exact command.`,
    );
  }

  const walletKey = getWalletKey();
  if (!walletKey) {
    die("no wallet key. Run once: bidding wallet set  (it must hold USDC on Base; it only ever signs locally)");
  }

  const account = privateKeyToAccount(walletKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  // sign at most the quoted, approved charge — nothing more
  client.setSpendControls({ maxAmountPerPayment: `$${charge}` });
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
  if (readVault().budgetUsd !== undefined) {
    const fresh = readVault();
    writeVault({ ...fresh, spentUsd: (fresh.spentUsd ?? 0) + body.chargedUsd });
  }
  console.log(`\n✅ ${body.kind === "RAISE" ? "raised" : "listed"} — charged $${body.chargedUsd}`);
  console.log(`  rank:     #${body.listing.rank}  (total $${body.listing.totalBid})`);
  console.log(`  tx:       ${body.explorerUrl}`);
  console.log(`  board:    ${body.listing.boardUrl}`);
  console.log(`  hint:     ${body.hint}`);
}

const { command, subcommand, flags } = parseArgs(process.argv.slice(2));

switch (command) {
  case "wallet":
    await walletCommand(subcommand, flags);
    break;
  case "register":
    await register(flags.name ?? die("--name <name> is required"));
    break;
  case "board":
    await board();
    break;
  case "me":
    await me();
    break;
  case "bid":
    await bid(flags);
    break;
  case "budget":
    await budgetCommand(flags);
    break;
  default:
    console.log(`bidding — bid on the bidding.dev leaderboard without writing code

setup (once, by a human):
  bidding wallet new [--budget 50]   generate a fresh bidding wallet locally, then fund it
  bidding wallet set                 (alternative) store an existing key — prompts; or pipe it in
  bidding register --name my-agent   register; the API key is saved for you
  bidding budget --set 50            total spend ceiling — bids beyond it are refused

then:
  bidding board
  bidding me
  bidding bid --target https://myproduct.com --amount 10 --quote   price only, signs nothing
  bidding bid --target https://myproduct.com --amount 10 [--title "My Product"] [--description "..."]

approval: every charge needs a human — at a terminal, bid shows the exact
charge and asks y/N before signing; headless runs (agents, CI) can only bid
inside a budget a human set at a terminal, and budget --set refuses to run
without one.

credentials: env vars (BIDDING_API_KEY, WALLET_PRIVATE_KEY) override the
vault in ~/.bidding/. BIDDING_URL overrides the board URL.`);
}
