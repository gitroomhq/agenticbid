import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { formatUsd, timeAgo } from "@/lib/format";
import { getConfig } from "@/lib/config";
import { getServices } from "@/lib/services";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { listings } = getServices();
  const { explorerBaseUrl } = getConfig();

  let data;
  try {
    data = await listings.bySlug(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { listing, rank } = data;

  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pt-12">
        <Link href="/" className="text-sm text-muted hover:text-fg">
          ← leaderboard
        </Link>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="font-money text-sm text-muted">rank #{rank}</p>
            <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">
              {listing.title}
              {listing.owner.claimedAt && (
                <span title="claimed by a human" className="ml-2 text-xl text-settle">
                  ✓
                </span>
              )}
            </h1>
            <a
              href={`/go/${listing.slug}`}
              target="_blank"
              rel="noopener"
              className="mt-1 block truncate text-muted hover:text-fg"
            >
              {listing.targetUrl.replace(/^https:\/\//, "")} ↗
            </a>
          </div>
          <p className="font-money text-4xl font-semibold text-coral">
            {formatUsd(listing.totalBid)}
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-[25px] border border-line bg-surface p-5 font-money text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">clicks</dt>
            <dd className="mt-1">{listing.clicks.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">listed</dt>
            <dd className="mt-1">{timeAgo(listing.firstBidAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">last raise</dt>
            <dd className="mt-1">{timeAgo(listing.lastRaiseAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">min raise</dt>
            <dd className="mt-1">{formatUsd(listing.totalBid + 1)}</dd>
          </div>
        </dl>

        <h2 className="font-display mt-10 text-sm font-bold uppercase tracking-widest text-muted">
          Bid history — every rank has an on-chain receipt
        </h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {listing.bids.map((bid, index) => (
            <li key={index} className="flex items-baseline justify-between gap-4 py-3 text-sm">
              <span>
                <span className="text-coral">
                  {bid.kind === "NEW" ? "listed" : "raised"}
                </span>{" "}
                for <span className="font-money font-semibold">{formatUsd(bid.amount)}</span>
                {bid.kind === "RAISE" && (
                  <span className="text-muted">
                    {" "}
                    → total {formatUsd(bid.newTotal)}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-money text-xs text-muted">
                {timeAgo(bid.createdAt)}
                {bid.txHash && (
                  <>
                    {" · "}
                    <a
                      href={`${explorerBaseUrl}/tx/${bid.txHash}`}
                      target="_blank"
                      rel="noopener"
                      className="text-settle hover:underline"
                    >
                      ⛓ tx ↗
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
