# Outbid Clone with x402 Crypto Payments — Build Plan

A pay-to-rank leaderboard (clone of [outbid.lol](https://outbid.lol/)) where **AI agents are first-class customers**: instead of Stripe Checkout, payments happen over **x402** (the HTTP 402 payment protocol) with **USDC settled directly to our own wallet** — no Stripe, no payment-processor account — and agents learn how to bid by reading a public **`skill.md`** (the [moltbook.com](https://www.moltbook.com/) pattern).

**Stack:** Next.js (App Router) · Tailwind CSS · Prisma · PostgreSQL · x402 v2 (`@x402/core` + `@x402/next`) · USDC on Base (Base Sepolia for dev).

---

## 1. Background Research

### 1.1 What outbid.lol is (what we're cloning)

A public leaderboard where **rank = bid, nothing else**:

- Anyone can list a **product website or X @handle**. New listings start at **$5 minimum** (whole dollars, $1 increments, max $999,999).
- To take **#1** you must bid at least **$5 more** than the current leader. If your bid can't reach #1, you land at whatever rank the amount can buy.
- **Equal bids keep placement order** — the older bid holds the higher rank.
- You can **raise your own listing**: new bid must exceed your current bid by ≥ $1 and **you only pay the difference**. Others can't take your spot for the difference — only you get that price.
- Clicks on a listing redirect to the target URL (query params stripped, shorteners expanded, no chat/invite links, no adult content).
- Extras: live activity feed (recent bids / rank changes), per-listing click counts, "trending" section ranked by clicks/hour.
- **No refunds.** Payment completion is what secures the rank.

### 1.2 What x402 is (replaces Stripe Checkout — and Stripe entirely)

[x402](https://www.x402.org/) is an open payment protocol (originated by Coinbase, backed by Cloudflare and others) that lets agents pay for HTTP resources programmatically with **no checkout UI and no processor account**, via an HTTP **402 challenge–response** flow:

```
[Agent]  --- request paid resource (no payment) --->  [Our server]
[Agent]  <-- HTTP 402 + PaymentRequirements --------  [Our server]
[Agent]  --- retry with X-PAYMENT header ----------->  [Our server]
[Server] --- verify + settle ----------------------->  [Facilitator → USDC lands in OUR wallet]
[Agent]  <-- resource + X-PAYMENT-RESPONSE receipt --  [Our server]
```

Key facts for our build:

- **No Stripe anywhere.** The agent signs an **EIP-3009 `transferWithAuthorization`** for USDC; a **facilitator** service verifies the signature and executes the transfer on-chain. Funds settle as **USDC directly into our wallet address** (`payTo`). We custody USDC ourselves; off-ramping to fiat (if ever needed) is a separate, optional step via an exchange.
- **Facilitators** (verify + settle, we never touch keys or run chain infra):
  - **Dev/testnet:** `https://x402.org/facilitator` — free, no signup, supports `base-sepolia`.
  - **Mainnet options:** Coinbase **CDP facilitator** (via `@coinbase/x402`, free CDP account, feeless USDC settlement on Base) or open no-signup facilitators like `https://facilitator.openx402.ai` (Base, Solana, Monad). Decide in §7.
  - Self-hosting a facilitator is possible (protocol is open) but not needed for v1.
- **Packages:** server `@x402/next` / `@x402/core` (+ `@x402/evm`) — note the older `x402-next` package is **v1, deprecated**; use v2 `@x402/*`. Client/test side: `@x402/fetch` (wraps `fetch`, auto-handles the 402 → sign → retry loop with a local wallet key).
- **Amounts** are expressed in atomic USDC units (6 decimals): a $5 bid = `5000000`. Minimums are effectively cents — far below our $5 floor, so micro-raises are no problem.
- **Dynamic pricing is supported and is our core requirement:** the static `paymentMiddleware(payTo, {route: {price}})` config doesn't fit a bid endpoint whose price depends on the request body. Instead the bid route computes the charge, **builds the `PaymentRequirements` itself, returns the 402, and calls the facilitator's `verify`/`settle` from inside the route handler** (v2 exposes these as library functions; confirm exact exports against the [coinbase/x402](https://github.com/coinbase/x402) v2 docs when wiring Phase 5).
- Reference implementations: [coinbase/x402 examples](https://github.com/coinbase/x402) (Next.js, Express, Hono, fetch clients).

### 1.3 The moltbook pattern (agent instructions)

Moltbook onboards agents with one line: *"Read https://www.moltbook.com/skill.md and follow the instructions."* Their `skill.md` is the full product manual for agents:

- **Registration** endpoint that returns an API key + a **claim URL** so a human can verify ownership.
- Every endpoint documented with: purpose, curl example, required/optional fields, sample response, practical guidance.
- Prominent **security warnings** (only send your API key to this domain), **rate limits** table, cooldowns, and failure cases.
- Friendly, opinionated tone that tells the agent *what to do next*, not just what exists.

We copy this: our site's homepage/footer says **"Are you an agent? Read `/skill.md`"**, and that file walks an agent from zero → registered → funded bid → live listing, entirely over HTTP with x402.

---

## 2. Architecture

```
┌──────────────────────────── Next.js (App Router) ────────────────────────────┐
│                                                                              │
│  Pages (human-facing, Tailwind)          API routes (agent-facing)           │
│  /            leaderboard                /api/v1/listings      GET (public)  │
│  /about, /rules                          /api/v1/bids          POST (402/x402)│
│  /activity    live feed                  /api/v1/agents/register POST        │
│  /go/[slug]   click redirect             /api/v1/me            GET (auth)    │
│  /skill.md    agent instructions         /api/v1/activity      GET (public)  │
│                                                                              │
│        x402 in the bids route (build 402 challenge / verify / settle)        │
└───────────────┬──────────────────────────────────────────┬───────────────────┘
                │ Prisma                                   │ HTTPS
         ┌──────▼──────┐                     ┌─────────────▼─────────────┐
         │  PostgreSQL │                     │ x402 Facilitator          │
         │             │                     │ (verify sig / settle)     │
         └─────────────┘                     └─────────────┬─────────────┘
                                                           │ on-chain
                                             ┌─────────────▼─────────────┐
                                             │ Base: USDC →  OUR WALLET  │
                                             └───────────────────────────┘
```

Design decisions:

- **One bid endpoint for humans and agents.** `POST /api/v1/bids` is x402-protected. Humans can use it too via an x402-capable wallet/agent; there is no checkout UI anywhere.
- **Dynamic 402 amounts.** The challenge amount is computed per request (new listing ≥ $5, take-#1 ≥ leader + $5, raise ≥ current + $1 paying only the difference). The route computes the price *first*, then returns `PaymentRequirements` with that exact amount — so a payment credential is only valid for the exact charge its request produced.
- **Rank is derived, not stored.** Rank = order by `totalBid DESC, firstBidAt ASC` (older bid wins ties, per outbid rules). No rank column to keep consistent.
- **Idempotency.** Every settled payment is stored with a unique constraint on its settlement transaction hash (and the signed authorization's nonce), so a replayed `X-PAYMENT` header can't double-apply a bid.
- **We custody USDC.** No auto-offramp: revenue accumulates as USDC at `payTo`. Keep the receiving key in a proper wallet (hardware or MPC), never on the server — the server only ever knows the public address.

---

## 3. Data Model (Prisma sketch)

```prisma
model Agent {
  id         String    @id @default(cuid())
  name       String
  apiKeyHash String    @unique          // sha256 of the bearer key
  claimToken String    @unique          // for human ownership claim (moltbook-style)
  claimedAt  DateTime?
  createdAt  DateTime  @default(now())
  bids       Bid[]
  listings   Listing[]
}

model Listing {
  id          String    @id @default(cuid())
  slug        String    @unique          // used in /go/[slug]
  targetUrl   String    @unique          // normalized: params stripped, shorteners expanded
  title       String
  totalBid    Int                        // whole USD dollars, current effective bid
  firstBidAt  DateTime  @default(now())  // tiebreaker: older keeps higher rank
  lastRaiseAt DateTime  @default(now())
  clicks      Int       @default(0)
  ownerId     String
  owner       Agent     @relation(fields: [ownerId], references: [id])
  bids        Bid[]
  clickEvents ClickEvent[]

  @@index([totalBid(sort: Desc), firstBidAt(sort: Asc)])  // the leaderboard query
}

model Bid {
  id            String   @id @default(cuid())
  amount        Int                       // dollars actually paid this transaction (the delta on raises)
  newTotal      Int                       // listing total after this bid
  kind          BidKind                   // NEW | RAISE
  paymentNonce  String   @unique          // EIP-3009 authorization nonce: idempotency pre-settle
  txHash        String?  @unique          // on-chain settlement tx hash (set once settled)
  network       String                    // "base" | "base-sepolia"
  payerAddress  String                    // the wallet that paid (from the verified authorization)
  listingId     String
  listing       Listing  @relation(fields: [listingId], references: [id])
  agentId       String
  agent         Agent    @relation(fields: [agentId], references: [id])
  createdAt     DateTime @default(now())
}

enum BidKind { NEW RAISE }

model ClickEvent {                        // powers trending (clicks/hour)
  id        String   @id @default(cuid())
  listingId String
  listing   Listing  @relation(fields: [listingId], references: [id])
  createdAt DateTime @default(now())
  @@index([listingId, createdAt])
}
```

---

## 4. The Bid Flow in Detail (x402 + business rules)

`POST /api/v1/bids` with body `{ targetUrl, title, amount }` and `Authorization: Bearer <agent key>`:

1. **Authenticate** the agent (registered via `/api/v1/agents/register`; unclaimed agents may bid, claim just adds a verified badge — same as moltbook).
2. **Normalize** `targetUrl` (strip query params, expand shorteners, reject chat/invite links & adult content) and look up whether a listing already exists.
3. **Validate the amount** against the rules:
   - New listing: `amount >= 5` and `amount <= 999_999`, integers only.
   - Existing listing owned by this agent (a *raise*): `amount >= currentTotal + 1`; the **charge is `amount - currentTotal`** (pay only the difference).
   - Existing listing owned by someone else: rejected — they must submit their own listing/URL (outbid semantics: you outrank people, you don't buy their slot).
   - Optionally return a hint: "beating #1 currently requires $X" (leader + 5).
4. **x402 challenge/verify/settle** for the computed charge:
   - **No `X-PAYMENT` header present** → respond `402` with `PaymentRequirements`: `scheme: "exact"`, `network` (base / base-sepolia), `maxAmountRequired` = charge in atomic USDC units (`charge * 1_000_000`), `payTo` = our wallet, `asset` = USDC contract for the network, `resource` = the request URL, short `maxTimeoutSeconds`, and a `description` that restates the bid ("New listing 'X' at $12").
   - **`X-PAYMENT` header present** → decode the payment payload, check it matches *this* request's computed requirements (amount, payTo, asset), then call the facilitator's **`verify`**. Reject with a machine-readable error if invalid, expired, or mismatched.
5. **On verified payment:**
   1. Insert the `Bid` row with the unique `paymentNonce` inside a DB transaction that also upserts the `Listing` and bumps `totalBid` (the unique constraint makes credential replay a no-op).
   2. Call the facilitator's **`settle`** — this executes `transferWithAuthorization` on-chain; store the returned `txHash` on the bid.
   3. If settle fails, roll the bid back (delete the row / compensating transaction) and return an error — rank is only secured by settled money.
   4. Respond with the listing's **new rank**, public URL, and the settlement receipt in the `X-PAYMENT-RESPONSE` header (per protocol) plus the JSON body.
6. Activity feed row is just the newest `Bid`s joined with listings.

Amount ↔ challenge binding: requirements are regenerated from the request body on every call, and the submitted payment payload is checked against them before `verify` — so an agent can only pay the exact amount its own bid requires. The EIP-3009 nonce + tx hash unique constraints prevent replays.

---

## 5. `public/skill.md` — Agent Instructions (moltbook-style)

Served at `https://<domain>/skill.md`, linked from the homepage ("🤖 Agents: read /skill.md to get listed"). Contents to write:

1. **What this is** — one paragraph: pay-to-rank leaderboard, rank is the bid, no refunds.
2. **Security warning** — only send your API key to this domain; your wallet key never leaves your machine — payments are signed locally and submitted via the x402 flow.
3. **Prerequisites** — a wallet holding USDC on Base (Base Sepolia + faucet USDC for the test board), and an x402-capable client (`@x402/fetch` one-liner, or any x402 agent tooling).
4. **Register** — `POST /api/v1/agents/register {name}` → returns `apiKey` + `claimUrl` for your human.
5. **Read the board** — `GET /api/v1/listings?sort=rank|trending` with curl example + sample response (includes `priceToBeatNumber1`).
6. **Bid with x402** — explain the 402 flow explicitly: "Send your bid; you will receive HTTP 402 with payment requirements; sign the USDC authorization with your wallet and retry with the `X-PAYMENT` header — `@x402/fetch` does this automatically." Include a full runnable example (Node script with `wrapFetchWithPayment` + a plain curl showing the raw 402 body). State min amounts and the raise-pays-the-difference rule.
7. **Rules** — allowed URLs, cooldowns/rate limits (e.g. 1 new listing per 10 min per agent), tie-breaking, no refunds.
8. **What to do next** — moltbook-style nudge: check your rank, monitor the activity feed, raise when outbid.

---

## 6. Build Checklist

Mark each `[ ]` → `[x]` as it's completed.

### Phase 0 — Prerequisites & accounts
- [ ] Create the **receiving wallet** (this is the whole "merchant account"): a fresh address whose key lives in a real wallet app / hardware wallet, never on the server. Store the address as `PAYTO_ADDRESS`
- [ ] Create a **test payer wallet** for local agent testing; fund it with Base Sepolia ETH + testnet USDC from the [Circle faucet](https://faucet.circle.com/) (`base-sepolia`)
- [ ] Pick facilitators: dev = `https://x402.org/facilitator` (no signup); decide mainnet facilitator (CDP via `@coinbase/x402` vs `facilitator.openx402.ai`) — see §7
- [ ] Provision local **PostgreSQL** (e.g. `docker run -e POSTGRES_PASSWORD=x402 -p 5432:5432 postgres:16`) and decide on hosted DB for prod (Neon/Supabase/RDS)

### Phase 1 — Project scaffolding
- [ ] `npx create-next-app@latest` (App Router, TypeScript, Tailwind, ESLint) in this directory
- [ ] `npm install @x402/core @x402/next @x402/evm prisma @prisma/client zod` (+ `@x402/fetch` and `viem` as dev deps for the test-agent script) — v2 `@x402/*` packages, **not** the deprecated `x402-next`
- [ ] `npx prisma init` — wire `DATABASE_URL`; create `.env.local` with `PAYTO_ADDRESS`, `X402_NETWORK=base-sepolia`, `FACILITATOR_URL`, `DATABASE_URL`; add `.env*` to `.gitignore` (note: no secret payment keys server-side at all)
- [ ] `git init` + first commit

### Phase 2 — Database
- [ ] Write the Prisma schema from §3 (`Agent`, `Listing`, `Bid`, `ClickEvent`, `BidKind`)
- [ ] `npx prisma migrate dev --name init`
- [ ] Prisma client singleton (`lib/db.ts`) + seed script with ~20 fake listings for local UI work

### Phase 3 — Core domain logic (no payments yet)
- [ ] URL normalizer: strip query params, expand shorteners (follow redirects), validate against blocklist (chat/invite links, adult content), canonicalize X handles
- [ ] Pricing/validation module implementing §4 rules: new ≥ $5, cap $999,999, integer dollars, raise ≥ +$1 paying the difference, take-#1 = leader + $5 hint, ties broken by `firstBidAt`
- [ ] Rank computation query (`ORDER BY totalBid DESC, firstBidAt ASC`) + helper that returns a listing's current rank
- [ ] Unit tests for pricing rules and tie-breaking (vitest)

### Phase 4 — Agent registration & auth
- [ ] `POST /api/v1/agents/register` — accepts `{name}`, generates API key (return once, store sha256 hash), returns `claimUrl` with `claimToken`
- [ ] Bearer-auth middleware for agent routes (hash lookup, timing-safe compare)
- [ ] `GET /api/v1/me` — agent's own listings, ranks, totals
- [ ] Human claim page `/claim/[token]` (simple: mark `claimedAt`, show "verified" badge on listings)
- [ ] Rate limits: registration per-IP, 1 new listing / 10 min / agent, bid retry throttling

### Phase 5 — x402 payment integration (the crypto part)
- [ ] Read the v2 server docs in [coinbase/x402](https://github.com/coinbase/x402) and pin the exact API for in-route (non-middleware) use: building `PaymentRequirements`, decoding `X-PAYMENT`, facilitator `verify`/`settle` calls (`@x402/core` exposes these; the static route-map middleware does NOT fit our dynamic prices)
- [ ] `lib/x402.ts`: helpers — `buildRequirements(chargeUsd, description, resourceUrl)` (atomic-USDC conversion, USDC asset address per network, `payTo`, timeout) + `verifyPayment(header, requirements)` + `settlePayment(...)` against `FACILITATOR_URL`
- [ ] `POST /api/v1/bids`: validate body → compute charge → no `X-PAYMENT` header ⇒ return 402 + requirements; header present ⇒ check payload matches requirements → facilitator `verify`
- [ ] On verified payment: DB transaction (upsert listing / insert `Bid` keyed by unique `paymentNonce` / bump `totalBid`) → facilitator `settle` → store `txHash`; roll back the bid if settle fails; respond with new rank + `X-PAYMENT-RESPONSE` receipt header
- [ ] Idempotency test: replaying the same `X-PAYMENT` credential must not double-bid
- [ ] Test-agent script (`scripts/test-bid.ts`): `@x402/fetch` `wrapFetchWithPayment` with the funded Base Sepolia test wallet → full roundtrip: 402 → auto-pay → listing appears; verify USDC arrived at `PAYTO_ADDRESS` on [Base Sepolia explorer](https://sepolia.basescan.org/)
- [ ] Negative tests: wrong amount, expired authorization, tampered `payTo`, replayed nonce — all rejected with machine-readable `{error, hint}`

### Phase 6 — Public read APIs
- [ ] `GET /api/v1/listings` — ranked board, cursor pagination, includes `priceToBeatNumber1` and each row's `minRaise`
- [ ] `GET /api/v1/listings/[slug]` — single listing with bid history
- [ ] `GET /api/v1/activity` — recent bids/rank changes
- [ ] `GET /go/[slug]` — 302 redirect to target URL + async `ClickEvent` insert (no tracking params added)
- [ ] Trending query: clicks/hour over trailing window from `ClickEvent`

### Phase 7 — Frontend (Tailwind)
- [ ] Leaderboard page `/`: ranked table (rank, title, bid, clicks, age), auto-refresh (poll or SWR), "🤖 Agents: read /skill.md" banner
- [ ] Trending strip (top by clicks/hour) + live activity feed sidebar
- [ ] Listing detail page with bid history (+ link each bid's `txHash` to the Base explorer — public, on-chain proof of every rank)
- [ ] `/rules` and `/about` pages (adapt the rules from §1.1)
- [ ] "How to bid" page for humans — explains that bidding is agent/x402-only and points at `/skill.md` (e.g. "paste this into Claude Code: *Read https://<domain>/skill.md and get my site listed with a $10 bid*")
- [ ] Dark, playful visual style; mobile responsive

### Phase 8 — `skill.md` for agents
- [ ] Write `public/skill.md` following §5 (prereqs → register → read board → 402 bid flow → rules → next steps), with a runnable `@x402/fetch` example, a raw curl showing the 402 body, and sample responses
- [ ] Add security section (API key only to this domain; wallet key never leaves the agent) and rate-limit table
- [ ] End-to-end dry run: point a fresh Claude Code session at the deployed `skill.md` and have it register + place a testnet bid **using only the file** — fix every ambiguity it stumbles on

### Phase 9 — Hardening & polish
- [ ] Zod-validate every API body; consistent JSON error shape `{error, hint}` (agents need machine-readable hints)
- [ ] Structured logs for every 402 issued / payment verified / settled / bid applied (audit trail; the chain itself is the payment ledger)
- [ ] Facilitator failure handling: timeouts/retries on `verify`+`settle`, and a reconciliation script that cross-checks `Bid.txHash` rows against on-chain transfers to `PAYTO_ADDRESS`
- [ ] Abuse controls: URL blocklist review flow, per-agent listing caps, optional admin delist endpoint
- [ ] Load-test the leaderboard query with 10k listings; add caching (e.g. 5s revalidate) on public reads

### Phase 10 — Deploy & go live
- [ ] Deploy (Vercel or a Node host; use the Node runtime, not edge, for the bids route)
- [ ] Production DB migration + backups
- [ ] Flip `X402_NETWORK=base`, point `FACILITATOR_URL` at the chosen mainnet facilitator (create the CDP account + API keys now if going with `@coinbase/x402`), confirm the mainnet USDC asset address
- [ ] Small real-money live test bid ($5) end-to-end from a real wallet; confirm USDC lands at `PAYTO_ADDRESS` on Base
- [ ] Point domain, publish `skill.md`, announce (moltbook-style one-liner: *"Agents: read https://<domain>/skill.md and outbid each other"*)

---

## 7. Open Questions (decide before Phase 5)

- [ ] **Mainnet facilitator:** Coinbase CDP (`@coinbase/x402` — free, feeless USDC on Base, but requires a CDP account) vs. a no-signup facilitator like openx402. Suggested: CDP if opening a Coinbase developer account is acceptable; openx402 if we want zero accounts anywhere.
- [ ] **Settle-then-record vs record-then-settle:** §4 records the bid then settles (rolling back on failure). Alternative: settle first, then record. Decide once we see the v2 API's failure modes; either way the nonce/txHash unique constraints keep it idempotent.
- [ ] **Solana support:** some facilitators settle USDC on Solana too. Launch Base-only (one network in `skill.md` = less agent confusion), add later if demand shows up.
- [ ] **USDC treasury:** funds accumulate at `PAYTO_ADDRESS`. Decide custody (hardware wallet vs MPC) and whether/when to off-ramp — no code impact, but decide before real money flows.
- [ ] **Humans without agents:** launch agent-only (purist, on-brand), or later add a hosted wallet flow for humans?
- [ ] **Refund on delist:** outbid.lol has no refunds; keep that (simplest — and on-chain transfers make refunds a manual treasury action anyway).
- [ ] **Charge currency display:** bids are whole USD; charges are USDC — display "$" everywhere and treat 1 USDC = $1.
- [ ] **Claim requirement:** allow unclaimed agents to bid (frictionless) vs. require human claim first (spam control). Suggested: allow, but badge claimed listings.

---

## Sources

- [outbid.lol](https://outbid.lol/) and [outbid.lol/rules](https://outbid.lol/rules) — mechanics being cloned
- [x402.org](https://www.x402.org/) — protocol site; testnet facilitator at `x402.org/facilitator`
- [coinbase/x402 (GitHub)](https://github.com/coinbase/x402) — spec, v2 `@x402/*` packages, server & client examples
- [x402 quickstart for sellers (Coinbase CDP docs)](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers) — Next.js/Express integration, CDP mainnet facilitator
- [Simplescraper — How to x402](https://simplescraper.io/blog/x402-payment-protocol) — practical walkthrough of the 402 flow and EIP-3009 mechanics
- [OpenX402 docs](https://docs.openx402.ai/building-a-server) — dynamic per-request pricing pattern, no-signup facilitator
- [moltbook.com](https://www.moltbook.com/) + [moltbook.com/skill.md](https://www.moltbook.com/skill.md) — agent-onboarding pattern
