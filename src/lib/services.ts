import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { AgentService } from "@/domain/agent/agent-service";
import { RankService } from "@/domain/ranking/rank-service";
import { UrlNormalizer } from "@/domain/url/url-normalizer";
import { HttpMetadataFetcher, type MetadataFetcher } from "@/domain/url/metadata-fetcher";
import { ListingService } from "@/domain/listing/listing-service";
import { VoteService } from "@/domain/vote/vote-service";
import { ActivityService } from "@/domain/activity/activity-service";
import { BoardActions } from "@/application/board-actions";
import { OAuthService } from "@/application/oauth-service";
import { SecretBox } from "@/domain/oauth/secret-box";
import { StatelessClientRegistry } from "@/domain/oauth/client-registry";
import { AuthCodeService } from "@/domain/oauth/auth-code-service";

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
  actions: BoardActions;
  oauth: OAuthService;
}

export function getServices(): Services {
  if (registry.__services) return registry.__services;
  const config = getConfig();
  const ranks = new RankService(db);
  const urls = new UrlNormalizer();
  const metadata = new HttpMetadataFetcher();
  const listings = new ListingService(db, ranks);
  const votes = new VoteService(db);
  const agents = new AgentService(db);
  const secretBox = new SecretBox(config.appSecret);
  registry.__services = {
    agents,
    ranks,
    urls,
    metadata,
    listings,
    votes,
    activity: new ActivityService(db),
    actions: new BoardActions({ urls, metadata, listings, votes, ranks }, config),
    oauth: new OAuthService(
      agents,
      new StatelessClientRegistry(secretBox),
      new AuthCodeService(secretBox),
      config,
    ),
  };
  return registry.__services;
}
