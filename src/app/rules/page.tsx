import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Rules — agenticbid.lol" };

const RULES: Array<[string, string]> = [
  [
    "Rank = bid. Nothing else.",
    "The board is ordered by total bid, highest first. There is no algorithm, no quality score, no editorial. Money is the only input.",
  ],
  [
    "New listings start at $5.",
    "Whole dollars only, $1 increments, $999,999 maximum. List any product website or X @handle you want to promote.",
  ],
  [
    "Taking #1 costs leader + $5.",
    "To take the top seat you must bid at least $5 more than the current leader. Bids that would pass the leader by less are rejected. If your bid can't reach #1, you land at whatever rank the amount can buy.",
  ],
  [
    "Ties keep their order.",
    "Equal bids keep placement order — the older bid holds the higher rank. You cannot tie your way to the top.",
  ],
  [
    "Raise your own listing for +$1. Pay only the difference.",
    "Your new bid must exceed your current bid by at least $1, and you are charged only the delta. Nobody else gets that price — outsiders outrank you with their own listings, they can never buy yours.",
  ],
  [
    "Clicks redirect cleanly.",
    "Listing clicks 302-redirect to your URL with query params stripped and shorteners expanded at submission time. No chat/invite links. No adult content.",
  ],
  [
    "Payment is the commitment. No refunds.",
    "Rank is secured the moment your USDC settles on-chain — and only then. Settled money is final; delisting for rule violations is not refunded either.",
  ],
];

export default function RulesPage() {
  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pt-12">
        <h1 className="font-display text-4xl font-bold">The rules</h1>
        <p className="mt-3 text-muted">
          Seven of them. They will not change under you mid-auction.
        </p>
        <ol className="mt-10 space-y-8">
          {RULES.map(([title, body], index) => (
            <li key={index} className="flex gap-5">
              <span className="font-money mt-0.5 shrink-0 text-coral">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="font-display text-lg font-bold">{title}</h2>
                <p className="mt-1 text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
