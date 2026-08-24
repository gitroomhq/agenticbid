/**
 * Decides whether a candidate target falls inside the "scope" of an existing
 * (deleted) target — so a delisted site can't sneak back with a subdomain,
 * a path, a trailing segment, or a www. prefix.
 *
 * Scopes are pluggable: X handles and websites are matched differently.
 */
export interface TargetScope {
  readonly name: string;
  /** True when this scope knows how to interpret the URL. */
  handles(url: URL): boolean;
  /** A stable key identifying the scope of `url` (e.g. its apex domain). */
  keyOf(url: URL): string;
  /** True when `candidate` lives inside the scope of `existing`. */
  covers(existing: URL, candidate: URL): boolean;
}

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);

/** Second-level public suffixes where the registrable domain is three labels deep. */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk",
  "com.au", "net.au", "org.au", "edu.au",
  "co.nz", "org.nz", "net.nz",
  "co.jp", "ne.jp", "or.jp", "ac.jp",
  "co.il", "org.il", "ac.il",
  "com.br", "net.br", "org.br",
  "co.in", "net.in", "org.in", "firm.in",
  "co.za", "org.za", "web.za",
  "com.mx", "org.mx",
  "com.ar", "com.sg", "com.hk", "com.tw", "com.cn", "com.tr", "co.kr", "co.id",
]);

/** The registrable (apex) domain: "app.foo.co.uk" -> "foo.co.uk". */
export function apexDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  const depth = MULTI_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-depth).join(".");
}

/** An X/Twitter profile: scope is the handle itself. */
export class XHandleScope implements TargetScope {
  readonly name = "x-handle";

  handles(url: URL): boolean {
    return X_HOSTS.has(url.hostname.toLowerCase()) && this.handleOf(url) !== null;
  }

  keyOf(url: URL): string {
    return `x:${this.handleOf(url)}`;
  }

  covers(existing: URL, candidate: URL): boolean {
    return this.handles(candidate) && this.keyOf(existing) === this.keyOf(candidate);
  }

  private handleOf(url: URL): string | null {
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * A website: scope is the apex domain. Deleting "foo.com" also covers
 * "www.foo.com", "app.foo.com", "foo.com/pricing", "foo.com:8080/x", ...
 */
export class WebsiteScope implements TargetScope {
  readonly name = "website";

  handles(): boolean {
    return true;
  }

  keyOf(url: URL): string {
    return `host:${apexDomain(url.hostname)}`;
  }

  covers(existing: URL, candidate: URL): boolean {
    return this.keyOf(existing) === this.keyOf(candidate);
  }
}

/** Picks the first scope that understands a URL; order matters (most specific first). */
export class TargetScopeResolver {
  constructor(private readonly scopes: TargetScope[] = [new XHandleScope(), new WebsiteScope()]) {}

  resolve(url: URL): TargetScope {
    const scope = this.scopes.find((candidate) => candidate.handles(url));
    if (!scope) throw new Error(`No target scope handles ${url.href}`);
    return scope;
  }

  /** Stable scope key of a canonical target URL string. */
  keyOf(targetUrl: string): string {
    const url = new URL(targetUrl);
    return this.resolve(url).keyOf(url);
  }

  /** True when `candidate` is inside the scope of `existing` (both canonical strings). */
  covers(existing: string, candidate: string): boolean {
    const existingUrl = new URL(existing);
    const candidateUrl = new URL(candidate);
    return this.resolve(existingUrl).covers(existingUrl, candidateUrl);
  }
}
