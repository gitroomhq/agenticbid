import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { AgentService } from "@/domain/agent/agent-service";
import { RankService } from "@/domain/ranking/rank-service";
import { UrlNormalizer } from "@/domain/url/url-normalizer";
import { HttpMetadataFetcher, type MetadataFetcher } from "@/domain/url/metadata-fetcher";
import { ListingService } from "@/domain/listing/listing-service";
import { VoteService } from "@/domain/vote/vote-service";
import { CommentService } from "@/domain/comment/comment-service";
import { ReviewService } from "@/domain/review/review-service";
import { ActivityService } from "@/domain/activity/activity-service";
import { BoardActions } from "@/application/board-actions";
import { OAuthService } from "@/application/oauth-service";
import { SecretBox } from "@/domain/oauth/secret-box";
import { StatelessClientRegistry } from "@/domain/oauth/client-registry";
import { AuthCodeService } from "@/domain/oauth/auth-code-service";
import {
  NullAnalyticsProvider,
  type AnalyticsProvider,
} from "@/domain/analytics/analytics-provider";
import { DatafastAnalyticsProvider } from "@/domain/analytics/datafast-provider";

/**
 * Composition root: every service is constructed once here with its
 * dependencies injected, so routes stay thin and implementations swappable.
 */
// Bump when the Services shape changes so a hot-reloaded dev server rebuilds
// the cached registry instead of serving one missing the new service.
const REGISTRY_VERSION = 4;

const registry = globalThis as unknown as {
  __services?: Services;
  __servicesVersion?: number;
};

export interface Services {
  agents: AgentService;
  ranks: RankService;
  urls: UrlNormalizer;
  metadata: MetadataFetcher;
  listings: ListingService;
  votes: VoteService;
  comments: CommentService;
  reviews: ReviewService;
  activity: ActivityService;
  actions: BoardActions;
  oauth: OAuthService;
  analytics: AnalyticsProvider;
}

export function getServices(): Services {
  if (registry.__services && registry.__servicesVersion === REGISTRY_VERSION) {
    return registry.__services;
  }
  registry.__servicesVersion = REGISTRY_VERSION;
  const config = getConfig();
  const ranks = new RankService(db);
  const urls = new UrlNormalizer();
  const metadata = new HttpMetadataFetcher();
  const reviews = new ReviewService(db);
  const listings = new ListingService(db, ranks, reviews);
  const votes = new VoteService(db);
  const comments = new CommentService(db);
  const agents = new AgentService(db);
  const secretBox = new SecretBox(config.appSecret);
  registry.__services = {
    agents,
    ranks,
    urls,
    metadata,
    listings,
    votes,
    comments,
    reviews,
    activity: new ActivityService(db),
    actions: new BoardActions(
      { urls, metadata, listings, votes, comments, reviews, ranks },
      config,
    ),
    oauth: new OAuthService(
      agents,
      new StatelessClientRegistry(secretBox),
      new AuthCodeService(secretBox),
      config,
    ),
    analytics:
      config.datafastApiKey && config.datafastWebsiteId
        ? new DatafastAnalyticsProvider(config.datafastApiKey, {
            websiteId: config.datafastWebsiteId,
          })
        : new NullAnalyticsProvider(),
  };
  return registry.__services;
}
