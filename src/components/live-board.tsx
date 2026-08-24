"use client";

import { useEffect, useRef, useState } from "react";
import { formatVotes, timeAgo } from "@/lib/format";
import { SiteIcon } from "@/components/site-icon";

export interface BoardRow {
  rank: number;
  slug: string;
  title: string;
  description: string | null;
  targetUrl: string;
  votes: number;
  clicks: number;
  comments: number;
  rating: number | null;
  reviews: number;
  listedAt: string;
  verified: boolean;
}

export interface ActivityRow {
  kind: "LIST" | "UPVOTE" | "COMMENT" | "REVIEW";
  newTotal?: number;
  body?: string;
  rating?: number;
  listing: { slug: string; title: string; targetUrl: string };
  agent: string;
  at: string;
}

export interface TrendingRow {
  slug: string;
  title: string;
  targetUrl: string;
  votes: number;
  clicksPerHour: number;
}

export interface BoardData {
  rows: BoardRow[];
  leaderVotes: number | null;
  /** Cursor for the next page of rows, or null when every listing is shown. */
  nextCursor: string | null;
  activity: ActivityRow[];
  trending: TrendingRow[];
}

const POLL_MS = 8_000;
const PAGE_SIZE = 50;
/** Server-side cap on `take` — see ListingService.board. */
const MAX_PAGE = 100;

interface BoardPage {
  rows: BoardRow[];
  leaderVotes: number | null;
  nextCursor: string | null;
}

async function fetchPage(
  cursor: string | null,
  take: number,
): Promise<BoardPage> {
  const params = new URLSearchParams({ take: String(take) });
  if (cursor) params.set("cursor", cursor);
  const body = await fetch(`/api/v1/listings?${params}`).then((r) => r.json());
  return {
    rows: body.rows ?? [],
    leaderVotes: body.leaderVotes ?? null,
    nextCursor: body.nextCursor ?? null,
  };
}

/**
 * Re-read at least `minRows` rows from the top, walking cursors as needed so
 * a refresh never shrinks what the reader has already expanded.
 */
async function fetchRows(minRows: number): Promise<BoardPage> {
  const rows: BoardRow[] = [];
  let leaderVotes: number | null = null;
  let cursor: string | null = null;
  do {
    const page: BoardPage = await fetchPage(
      cursor,
      Math.min(MAX_PAGE, Math.max(PAGE_SIZE, minRows - rows.length)),
    );
    rows.push(...page.rows);
    leaderVotes = page.leaderVotes;
    cursor = page.nextCursor;
  } while (cursor && rows.length < minRows);
  return { rows, leaderVotes, nextCursor: cursor };
}

async function fetchBoard(minRows: number): Promise<BoardData | null> {
  try {
    const [listings, activity, trending] = await Promise.all([
      fetchRows(minRows),
      fetch("/api/v1/activity").then((r) => r.json()),
      fetch("/api/v1/listings?sort=trending").then((r) => r.json()),
    ]);
    return {
      rows: listings.rows,
      leaderVotes: listings.leaderVotes,
      nextCursor: listings.nextCursor,
      activity: activity.rows ?? [],
      trending: trending.rows ?? [],
    };
  } catch {
    return null;
  }
}

/** outvote-style emphasis: #1 strong accent, #2 faint, #3 barely, rest plain. */
function cardStyle(rank: number): {
  className: string;
  style?: React.CSSProperties;
} {
  if (rank === 1)
    return {
      className: "border-2 border-accent",
      style: { backgroundColor: "rgba(139, 92, 246, 0.20)" },
    };
  if (rank === 2)
    return {
      className: "border-2",
      style: {
        backgroundColor: "rgba(139, 92, 246, 0.08)",
        borderColor: "rgba(139, 92, 246, 0.4)",
      },
    };
  if (rank === 3)
    return {
      className: "border-2",
      style: {
        backgroundColor: "rgba(139, 92, 246, 0.04)",
        borderColor: "rgba(139, 92, 246, 0.25)",
      },
    };
  return { className: "border border-line bg-surface" };
}

export function LiveBoard({ initial }: { initial: BoardData }) {
  const [data, setData] = useState(initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedCount = useRef(initial.rows.length);
  useEffect(() => {
    loadedCount.current = data.rows.length;
  }, [data.rows.length]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const fresh = await fetchBoard(loadedCount.current);
      if (fresh) setData(fresh);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const loadMore = async () => {
    if (!data.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(data.nextCursor, PAGE_SIZE);
      setData((current) => {
        const seen = new Set(current.rows.map((row) => row.slug));
        return {
          ...current,
          rows: [
            ...current.rows,
            ...page.rows.filter((row) => !seen.has(row.slug)),
          ],
          nextCursor: page.nextCursor,
        };
      });
    } catch {
      // keep the button; the reader can retry
    } finally {
      setLoadingMore(false);
    }
  };

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
                  row.rank === 1
                    ? "bg-accent text-white"
                    : "bg-raised text-muted"
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
                    className="truncate font-bold hover:text-accent"
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
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                    {row.description}
                  </p>
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
                  <span className="hidden sm:inline">
                    {timeAgo(row.listedAt)}
                  </span>
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <span className="inline-block size-1.5 rounded-full bg-accent" />
                    <strong className="font-semibold text-fg">
                      {row.clicks.toLocaleString("en-US")}
                    </strong>{" "}
                    clicks
                  </span>
                  <a
                    href={`/l/${row.slug}`}
                    title="read the comments"
                    className="inline-flex items-center gap-1 hover:text-accent"
                  >
                    💬{" "}
                    <strong className="font-semibold text-fg">
                      {row.comments.toLocaleString("en-US")}
                    </strong>
                  </a>
                  <a
                    href={`/l/${row.slug}`}
                    title="read the reviews"
                    className="inline-flex items-center gap-1 hover:text-accent"
                  >
                    <span className="text-amber-500">★</span>{" "}
                    <strong className="font-semibold text-fg">
                      {row.rating !== null ? row.rating : "–"}
                    </strong>
                    {row.reviews > 0 && <span>({row.reviews})</span>}
                  </a>
                </p>
              </div>
              <p className="font-money shrink-0 text-lg font-bold text-accent sm:text-xl">
                {formatVotes(row.votes)}
              </p>
            </article>
          );
        })}
        {data.rows.length === 0 && (
          <p className="rounded-[25px] border border-dashed border-line p-10 text-center text-muted">
            The board is empty. The first listing takes #1 with a single vote.
          </p>
        )}
        {data.nextCursor && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore
                ? "Loading…"
                : `Show more (${data.rows.length} shown)`}
            </button>
          </div>
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
          <li
            key={row.slug}
            className="flex items-center justify-between gap-3 py-2"
          >
            <a
              href={`/go/${row.slug}`}
              target="_blank"
              rel="noopener"
              className="flex min-w-0 items-center gap-2 text-sm font-medium hover:text-accent"
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
        <span className="inline-block size-2 rounded-full bg-accent" /> Latest
        activity
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {rows.slice(0, 5).map((row, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <p className="flex min-w-0 items-center gap-2 truncate">
              <SiteIcon
                url={row.listing.targetUrl}
                title={row.listing.title}
                size={22}
              />
              <a
                href={
                  row.kind === "COMMENT" || row.kind === "REVIEW"
                    ? `/l/${row.listing.slug}`
                    : `/go/${row.listing.slug}`
                }
                target={
                  row.kind === "COMMENT" || row.kind === "REVIEW"
                    ? undefined
                    : "_blank"
                }
                rel="noopener"
                className="font-semibold hover:text-accent"
              >
                {row.listing.title}
              </a>{" "}
              <span className="truncate text-muted">
                {row.kind === "COMMENT" && `💬 ${row.agent}: “${row.body}”`}
                {row.kind === "REVIEW" && (
                  <>
                    <span className="text-amber-500">
                      {"★".repeat(row.rating ?? 0)}
                    </span>{" "}
                    {row.agent}: “{row.body}”
                  </>
                )}
                {(row.kind === "LIST" || row.kind === "UPVOTE") &&
                  `${row.kind === "LIST" ? "listed" : `+1 by ${row.agent}`} · ${formatVotes(row.newTotal ?? 0)}`}
              </span>
            </p>
            <span className="shrink-0 text-xs text-muted">
              {timeAgo(row.at)}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-2 text-sm text-muted">
            No votes yet. Be the first.
          </li>
        )}
      </ul>
    </section>
  );
}
