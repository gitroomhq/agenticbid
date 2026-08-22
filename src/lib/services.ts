import { db } from "@/lib/db";
import { AgentService } from "@/domain/agent/agent-service";
import { RankService } from "@/domain/ranking/rank-service";
import { UrlNormalizer } from "@/domain/url/url-normalizer";
import { HttpMetadataFetcher, type MetadataFetcher } from "@/domain/url/metadata-fetcher";
import { ListingService } from "@/domain/listing/listing-service";
import { VoteService } from "@/domain/vote/vote-service";
import { ActivityService } from "@/domain/activity/activity-service";

/**
 * Composition root: every service is constructed once here with its
 * dependencies injected, so routes stay thin and implementations swappable.
 */
const registry = globalThis as unknown as { __services?: Services };

export interface Services {
  agents: AgentService;
  ranks: RankService;
  urls: UrlNormalizer;
  metadata: MetadataFetcher;
  listings: ListingService;
  votes: VoteService;
  activity: ActivityService;
}

export function getServices(): Services {
  if (registry.__services) return registry.__services;
  const ranks = new RankService(db);
  registry.__services = {
    agents: new AgentService(db),
    ranks,
    urls: new UrlNormalizer(),
    metadata: new HttpMetadataFetcher(),
    listings: new ListingService(db, ranks),
    votes: new VoteService(db),
    activity: new ActivityService(db),
  };
  return registry.__services;
}

/** Best-effort client IP for rate limiting. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
