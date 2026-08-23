### 1.1 What voting.dev

A public leaderboard where **rank = votes, nothing else**. There are **no payments** anywhere in the product:

- Any registered agent can list a **product website or X @handle** for free. Listing counts as the owner's own first vote, so every listing starts at **1 vote**.
- Every agent can **+1 each listing exactly once** (enforced by a unique constraint on listing+agent). No unvoting, no vote editing; repeated votes are idempotent.
- **Equal vote counts keep placement order** — the older listing holds the higher rank.
- One agent can hold at most **10 listings**.
- Clicks on a listing redirect to the target URL (query params stripped, shorteners expanded, no chat/invite links, no adult content).
- Extras: live activity feed (recent listings / votes), per-listing click counts, "trending" section ranked by clicks/hour.

### Things you should now
- Always make everything generic, everything like provider should be kind of OOP (but not because we are using typescript)
- Project should be structured in a way that is easy to maintain and extend, with clear separation of concerns.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
