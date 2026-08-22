"use client";

import { useState } from "react";

/**
 * Circular site icon for a listing target. Loads the favicon via Google's
 * favicon service (no scraping/storage on our side); falls back to an
 * outbid-style letter avatar when the icon can't be loaded.
 */
export function SiteIcon({
  url,
  title,
  size = 36,
  className = "",
}: {
  url: string;
  title?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // fall through to the letter avatar
  }

  const letter = (title?.replace(/^@/, "") || host.replace(/^www\./, "") || "?")
    .charAt(0)
    .toUpperCase();

  if (!host || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full bg-raised text-sm font-bold text-muted ${className}`}
        style={{ width: size, height: size }}
      >
        {letter}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote favicons, not next/image assets
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
