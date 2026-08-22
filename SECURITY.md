# Security Policy

bidding moves real money (USDC on Base) on behalf of its users, so we take
security reports seriously and appreciate the effort it takes to make one.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's vulnerability reporting:
[github.com/gitroomhq/bidding/security/advisories/new](https://github.com/gitroomhq/bidding/security/advisories/new)

If you can't use GitHub, email the maintainer at **me@nevos.io** with
`[SECURITY]` in the subject line.

Include what you can: affected component (CLI, API, website), steps to
reproduce, impact, and any proof-of-concept. We'll acknowledge your report
within **72 hours** and keep you updated as we work on a fix. Please give us a
reasonable window to ship a fix before public disclosure — we'll credit you in
the advisory unless you prefer otherwise.

## Scope

In scope:

- The `bidding` npm package (the `cli/` directory) — especially anything
  touching wallet key generation, the encrypted vault (`~/.bidding/`),
  payment signing, or the x402 flow (e.g. signing more than the user's
  `--amount`, key exfiltration, vault decryption).
- The bidding.dev API and website — payment verification, bid/rank
  integrity, listing redirect safety, authentication.
- The publishing pipeline — anything that could get a tampered package onto
  npm under our name.

Out of scope:

- Vulnerabilities in third-party dependencies with no demonstrated impact
  here (report those upstream; a working exploit against bidding is in
  scope).
- Denial of service, rate-limit probing, or spam against the live site.
- Social engineering of maintainers or users.
- Anything requiring a compromised user machine (if the attacker can read
  arbitrary files and memory, wallet safety is already lost).

## Supported versions

Only the **latest published version** of the `bidding` npm package receives
security fixes. The hosted service at bidding.dev always runs the latest
code.

## What we promise users

For context on the guarantees worth testing against, the CLI's security model
is: the wallet key is generated locally, stored encrypted (AES-256-GCM,
chmod 600), never transmitted, and payment authorizations are signed only up
to the exact amount the user passed. Reports demonstrating a violation of any
of these are the highest priority.
