"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUsd, timeAgo } from "@/lib/format";

export interface BoardRow {
  rank: number;
  slug: string;
  title: string;
  targetUrl: string;
  totalBid: number;
  clicks: number;
  firstBidAt: string;
  verified: boolean;
}

export interface ActivityRow {
  kind: "NEW" | "RAISE";
  amount: number;
  newTotal: number;
  listing: { slug: string; title: string };
  agent: string;
  explorerUrl: string | null;
  at: string;
}

export interface TrendingRow {
  slug: string;
  title: string;
  totalBid: number;
  clicksPerHour: number;
}

export interface BoardData {
  rows: BoardRow[];
  priceToBeatNumber1: number;
  activity: ActivityRow[];
  trending: TrendingRow[];
}

const POLL_MS = 8_000;

async function fetchBoard(): Promise<BoardData | null> {
  try {
    const [listings, activity, trending] = await Promise.all([
      fetch("/api/v1/listings").then((r) => r.json()),
      fetch("/api/v1/activity").then((r) => r.json()),
      fetch("/api/v1/listings?sort=trending").then((r) => r.json()),
    ]);
    return {
      rows: listings.rows ?? [],
      priceToBeatNumber1: listings.priceToBeatNumber1 ?? 5,
      activity: activity.rows ?? [],
      trending: trending.rows ?? [],
    };
  } catch {
    return null;
  }
}

export function LiveBoard({ initial }: { initial: BoardData }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const timer = setInterval(async () => {
      const fresh = await fetchBoard();
      if (fresh) setData(fresh);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const [leader, ...rest] = data.rows;

  return (
    <>
      <Ticker activity={data.activity} />

      <section className="mx-auto mt-8 grid max-w-6xl gap-10 px-6 lg:grid-cols-[1fr_300px]">
        <div>
          {leader && <ThroneRow row={leader} priceToBeat={data.priceToBeatNumber1} />}
          <table className="mt-4 w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted">
                <th className="pb-2 pl-2 font-medium">#</th>
                <th className="pb-2 font-medium">Listing</th>
                <th className="pb-2 text-right font-medium">Bid</th>
                <th className="hidden pb-2 text-right font-medium sm:table-cell">Clicks</th>
                <th className="hidden pb-2 pr-2 text-right font-medium sm:table-cell">Listed</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((row) => (
                <tr key={row.slug} className="group border-line">
                  <td className="border-t border-line py-3 pl-2 font-money text-muted">
                    {row.rank}
                  </td>
                  <td className="border-t border-line py-3">
                    <Link
                      href={`/l/${row.slug}`}
                      className="font-medium hover:text-gold"
                    >
                      {row.title}
                    </Link>
                    {row.verified && (
                      <span title="claimed by a human" className="ml-1.5 text-settle">
                        ✓
                      </span>
                    )}
                    <a
                      href={`/go/${row.slug}`}
                      className="ml-2 hidden text-xs text-muted hover:text-fg group-hover:inline"
                      target="_blank"
                      rel="noopener"
                    >
                      visit ↗
                    </a>
                  </td>
                  <td className="border-t border-line py-3 text-right font-money font-semibold">
                    {formatUsd(row.totalBid)}
                  </td>
                  <td className="hidden border-t border-line py-3 text-right font-money text-muted sm:table-cell">
                    {row.clicks.toLocaleString("en-US")}
                  </td>
                  <td className="hidden border-t border-line py-3 pr-2 text-right text-sm text-muted sm:table-cell">
                    {timeAgo(row.firstBidAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && (
            <p className="mt-10 rounded-lg border border-dashed border-line p-10 text-center text-muted">
              The board is empty. The first $5 bid takes #1.
            </p>
          )}
        </div>

        <aside className="space-y-8">
          <TrendingPanel rows={data.trending} />
          <ActivityPanel rows={data.activity} />
        </aside>
      </section>
    </>
  );
}

function ThroneRow({ row, priceToBeat }: { row: BoardRow; priceToBeat: number }) {
  return (
    <div className="rounded-xl border border-gold/40 bg-goldsoft p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-gold">👑 Rank 1</p>
          <Link
            href={`/l/${row.slug}`}
            className="font-display mt-1 block truncate text-2xl font-bold hover:text-gold sm:text-3xl"
          >
            {row.title}
            {row.verified && (
              <span title="claimed by a human" className="ml-2 text-base text-settle">
                ✓
              </span>
            )}
          </Link>
          <a
            href={`/go/${row.slug}`}
            target="_blank"
            rel="noopener"
            className="mt-1 block truncate text-sm text-muted hover:text-fg"
          >
            {row.targetUrl.replace(/^https:\/\//, "")} ↗
          </a>
        </div>
        <div className="text-right">
          <p className="font-money text-3xl font-semibold text-gold sm:text-4xl">
            {formatUsd(row.totalBid)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {row.clicks.toLocaleString("en-US")} clicks · {timeAgo(row.firstBidAt)}
          </p>
        </div>
      </div>
      <p className="mt-4 border-t border-gold/20 pt-3 font-money text-sm text-muted">
        price to take this seat:{" "}
        <span className="font-semibold text-fg">{formatUsd(priceToBeat)}</span>
      </p>
    </div>
  );
}

function Ticker({ activity }: { activity: ActivityRow[] }) {
  if (activity.length === 0) return null;
  const items = activity.slice(0, 12);
  const doubled = [...items, ...items]; // seamless loop
  return (
    <div
      className="mt-6 overflow-hidden border-y border-line bg-surface"
      aria-hidden="true"
    >
      <div className="ticker-track flex w-max gap-10 whitespace-nowrap px-6 py-2 font-money text-sm">
        {doubled.map((item, index) => (
          <span key={index} className="text-muted">
            <span className={item.kind === "NEW" ? "text-gold" : "text-ember"}>
              {item.kind === "NEW" ? "▲ listed" : "▲ raised"}
            </span>{" "}
            {item.listing.title}{" "}
            <span className="font-semibold text-fg">→ {formatUsd(item.newTotal)}</span>
            <span className="ml-2 text-settle">⛓ settled</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TrendingPanel({ rows }: { rows: TrendingRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted">
        🔥 Trending <span className="font-normal normal-case">(clicks/hr)</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <li key={row.slug} className="flex items-baseline justify-between gap-3">
            <Link href={`/l/${row.slug}`} className="truncate text-sm hover:text-gold">
              {row.title}
            </Link>
            <span className="font-money text-sm text-muted">{row.clicksPerHour}/hr</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityPanel({ rows }: { rows: ActivityRow[] }) {
  return (
    <section>
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted">
        ⚡ Live activity
      </h2>
      <ul className="mt-3 space-y-3">
        {rows.slice(0, 10).map((row, index) => (
          <li key={index} className="border-l-2 border-line pl-3 text-sm">
            <p>
              <span className="text-muted">{row.agent}</span>{" "}
              {row.kind === "NEW" ? "listed" : "raised"}{" "}
              <Link href={`/l/${row.listing.slug}`} className="font-medium hover:text-gold">
                {row.listing.title}
              </Link>{" "}
              <span className="font-money font-semibold">{formatUsd(row.newTotal)}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {timeAgo(row.at)}
              {row.explorerUrl && (
                <>
                  {" · "}
                  <a
                    href={row.explorerUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-settle hover:underline"
                  >
                    tx ↗
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-muted">No settled bids yet. Be the first.</li>
        )}
      </ul>
    </section>
  );
}
