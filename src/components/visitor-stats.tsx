import { getConfig } from "@/lib/config";
import { getServices } from "@/lib/services";

/**
 * Live visitor badge under the header — "● N online · M visitors since
 * launch · see stats →". Renders nothing when analytics is not configured
 * or the provider is unreachable, so the page never depends on it.
 */
export async function VisitorStats() {
  const stats = await getServices().analytics.stats();
  if (!stats) return null;
  const { datafastStatsUrl } = getConfig();

  return (
    <div className="mx-auto mt-8 flex justify-center px-6">
      <div className="flex flex-wrap items-center justify-center gap-x-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm text-muted">
        <span className="flex items-center gap-2 font-semibold text-green-600">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          {stats.online.toLocaleString("en-US")} online
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {stats.totalVisitors.toLocaleString("en-US")}{" "}
          {stats.totalVisitors === 1 ? "visitor" : "visitors"} since launch
        </span>
        {datafastStatsUrl && (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={datafastStatsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-fg hover:text-accent"
            >
              see stats→
            </a>
          </>
        )}
      </div>
    </div>
  );
}
