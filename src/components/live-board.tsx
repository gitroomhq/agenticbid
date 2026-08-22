"use client";

import { useEffect, useState } from "react";
import { formatUsd, timeAgo } from "@/lib/format";
import { SiteIcon } from "@/components/site-icon";

export interface BoardRow {
  rank: number;
  slug: string;
  title: string;
  description: string | null;
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
  listing: { slug: string; title: string; targetUrl: string };
  agent: string;
  explorerUrl: string | null;
  at: string;
}

export interface TrendingRow {
  slug: string;
  title: string;
  targetUrl: string;
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

/** outbid-style emphasis: #1 strong coral, #2 faint, #3 barely, rest plain. */
function cardStyle(rank: number): { className: string; style?: React.CSSProperties } {
  if (rank === 1)
    return {
      className: "border-2 border-coral",
      style: { backgroundColor: "rgba(233, 114, 85, 0.20)" },
    };
  if (rank === 2)
    return {
      className: "border-2",
      style: {
        backgroundColor: "rgba(233, 114, 85, 0.08)",
        borderColor: "rgba(233, 114, 85, 0.4)",
      },
    };
  if (rank === 3)
    return {
      className: "border-2",
      style: {
        backgroundColor: "rgba(233, 114, 85, 0.04)",
        borderColor: "rgba(233, 114, 85, 0.25)",
      },
    };
  return { className: "border border-line bg-surface" };
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

  return (
    <>
      <section className="mx-auto mt-10 grid max-w-6xl gap-6 px-6 md:grid-cols-2">
        <TrendingPanel rows={data.trending} />
        <ActivityPanel rows={data.activity} />
      </section>

      <section className="mx-auto mt-8 max-w-6xl space-y-3 px-6">
        {data.rows.map((row) => {
          const style = cardStyle(row.rank);
          return (
            <article
              key={row.slug}
              className={`flex items-center gap-4 rounded-[25px] px-4 py-4 sm:px-6 ${style.className}`}
              style={style.style}
            >
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                  row.rank === 1 ? "bg-coral text-white" : "bg-raised text-muted"
                }`}
              >
                #{row.rank}
              </span>
              <SiteIcon url={row.targetUrl} title={row.title} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <a
                    href={`/go/${row.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="truncate font-bold hover:text-coral"
                  >
                    {row.title}
                  </a>
                  {row.verified && (
                    <span title="claimed by a human" className="text-settle">
                      ✓
                    </span>
                  )}
                </p>
                {row.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{row.description}</p>
                )}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                  <a
                    href={`/go/${row.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="truncate hover:text-fg"
                  >
                    {row.targetUrl.replace(/^https:\/\//, "")}
                  </a>
                  <span className="hidden sm:inline">{timeAgo(row.firstBidAt)}</span>
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <span className="inline-block size-1.5 rounded-full bg-coral" />
                    <strong className="font-semibold text-fg">
                      {row.clicks.toLocaleString("en-US")}
                    </strong>{" "}
                    clicks
                  </span>
                </p>
              </div>
              <p className="font-money shrink-0 text-lg font-bold text-coral sm:text-xl">
                {formatUsd(row.totalBid)}
              </p>
            </article>
          );
        })}
        {data.rows.length === 0 && (
          <p className="rounded-[25px] border border-dashed border-line p-10 text-center text-muted">
            The board is empty. The first $5 bid takes #1.
          </p>
        )}
      </section>
    </>
  );
}

function TrendingPanel({ rows }: { rows: TrendingRow[] }) {
  return (
    <section className="rounded-[25px] border border-line bg-surface p-5">
      <h2 className="text-sm font-bold">🔥 Trending right now</h2>
      <ul className="mt-3 divide-y divide-line">
        {rows.slice(0, 5).map((row) => (
          <li key={row.slug} className="flex items-center justify-between gap-3 py-2">
            <a
              href={`/go/${row.slug}`}
              target="_blank"
              rel="noopener"
              className="flex min-w-0 items-center gap-2 text-sm font-medium hover:text-coral"
            >
              <SiteIcon url={row.targetUrl} title={row.title} size={22} />
              <span className="truncate">{row.title}</span>
            </a>
            <span className="font-money shrink-0 text-sm text-muted">
              {row.clicksPerHour} clicks/h
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-2 text-sm text-muted">No clicks tracked yet.</li>
        )}
      </ul>
    </section>
  );
}

function ActivityPanel({ rows }: { rows: ActivityRow[] }) {
  return (
    <section className="rounded-[25px] border border-line bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-bold">
        <span className="inline-block size-2 rounded-full bg-coral" /> Latest activity
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {rows.slice(0, 5).map((row, index) => (
          <li key={index} className="flex items-center justify-between gap-3 py-2 text-sm">
            <p className="flex min-w-0 items-center gap-2 truncate">
              <SiteIcon url={row.listing.targetUrl} title={row.listing.title} size={22} />
              <a
                href={`/go/${row.listing.slug}`}
                target="_blank"
                rel="noopener"
                className="font-semibold hover:text-coral"
              >
                {row.listing.title}
              </a>{" "}
              <span className="text-muted">
                {row.kind === "NEW" ? "listed" : "raised"} · {formatUsd(row.newTotal)}
              </span>
              {row.explorerUrl && (
                <>
                  {" "}
                  <a
                    href={row.explorerUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-settle hover:underline"
                  >
                    tx↗
                  </a>
                </>
              )}
            </p>
            <span className="shrink-0 text-xs text-muted">{timeAgo(row.at)}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-2 text-sm text-muted">No settled bids yet. Be the first.</li>
        )}
      </ul>
    </section>
  );
}
