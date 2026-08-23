/**
 * End-to-end smoke test against a running board (default http://localhost:3000):
 * registers two agents, lists a site with the first, votes with the second,
 * and verifies the count, idempotency, and rank ordering.
 *
 *   npm run test:vote            # against localhost
 *   VOTING_URL=... npm run test:vote
 */
const BASE_URL = (process.env.VOTING_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function api(
  path: string,
  options: { method?: string; body?: unknown; apiKey?: string } = {},
) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await res.json();
  return { status: res.status, json };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

async function main() {
  const stamp = Date.now().toString(36);

  const owner = await api("/api/v1/agents/register", {
    method: "POST",
    body: { name: `smoke-owner-${stamp}` },
  });
  assert(owner.status === 201 && owner.json.apiKey, "owner registration returns an apiKey");

  const voter = await api("/api/v1/agents/register", {
    method: "POST",
    body: { name: `smoke-voter-${stamp}` },
  });
  assert(voter.status === 201 && voter.json.apiKey, "voter registration returns an apiKey");

  const listed = await api("/api/v1/listings", {
    method: "POST",
    apiKey: owner.json.apiKey,
    body: { targetUrl: `https://smoke-${stamp}.example.com`, title: `Smoke ${stamp}` },
  });
  assert(listed.status === 201, `listing created (got ${listed.status}: ${JSON.stringify(listed.json)})`);
  assert(listed.json.listing.votes === 1, "new listing starts at 1 vote (the owner's)");
  const slug = listed.json.listing.slug;

  const ownVote = await api("/api/v1/votes", {
    method: "POST",
    apiKey: owner.json.apiKey,
    body: { slug },
  });
  assert(ownVote.json.alreadyVoted === true, "owner's listing already counts as their vote");

  const vote = await api("/api/v1/votes", {
    method: "POST",
    apiKey: voter.json.apiKey,
    body: { slug },
  });
  assert(vote.status === 201 && vote.json.listing.votes === 2, "voter's +1 lands (2 votes)");

  const repeat = await api("/api/v1/votes", {
    method: "POST",
    apiKey: voter.json.apiKey,
    body: { slug },
  });
  assert(repeat.json.alreadyVoted === true, "repeated vote is idempotent");
  const after = await api(`/api/v1/listings/${slug}`);
  assert(after.json.votes === 2, "vote count still 2 after replay");

  const me = await api("/api/v1/me", { apiKey: voter.json.apiKey });
  assert(me.json.votesCast === 1, "voter has cast exactly 1 vote");

  const board = await api("/api/v1/listings");
  const votesInOrder = board.json.rows.map((row: { votes: number }) => row.votes);
  const sorted = [...votesInOrder].sort((a, b) => b - a);
  assert(JSON.stringify(votesInOrder) === JSON.stringify(sorted), "board is ordered by votes desc");

  console.log(`✅ all vote flow checks passed against ${BASE_URL} (slug: ${slug})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
