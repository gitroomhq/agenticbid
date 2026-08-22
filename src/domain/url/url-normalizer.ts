import { ApiError } from "@/lib/errors";

/**
 * A single validation rule applied to a candidate target URL.
 * Rules throw ApiError when the URL is not acceptable.
 */
export interface UrlRule {
  readonly name: string;
  check(url: URL): void;
}

/** Follows redirects so shortened URLs resolve to their real destination. */
export interface RedirectExpander {
  expand(url: URL): Promise<URL>;
}

const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "tiny.cc",
  "rb.gy",
  "shorturl.at",
  "lnkd.in",
  "s.id",
]);

const CHAT_INVITE_PATTERNS: Array<{ host: RegExp; path?: RegExp }> = [
  { host: /(^|\.)discord\.gg$/ },
  { host: /(^|\.)discord\.com$/, path: /^\/invite\// },
  { host: /(^|\.)t\.me$/ },
  { host: /(^|\.)telegram\.me$/ },
  { host: /(^|\.)chat\.whatsapp\.com$/ },
  { host: /(^|\.)wa\.me$/ },
  { host: /(^|\.)slack\.com$/, path: /^\/join\// },
  { host: /(^|\.)join\.slack\.com$/ },
  { host: /(^|\.)signal\.group$/ },
  { host: /(^|\.)m\.me$/ },
];

const ADULT_HOST_KEYWORDS = [
  "porn",
  "xxx",
  "xvideos",
  "xnxx",
  "xhamster",
  "onlyfans",
  "redtube",
  "youporn",
  "chaturbate",
  "stripchat",
  "adult",
  "hentai",
  "nsfw",
  "camgirl",
  "escort",
];

const X_HOSTS = new Set(["x.com", "twitter.com", "www.x.com", "www.twitter.com"]);

class SchemeRule implements UrlRule {
  readonly name = "scheme";
  check(url: URL): void {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ApiError(422, "invalid_url_scheme", "Only http(s) URLs are allowed.");
    }
  }
}

class PublicHostRule implements UrlRule {
  readonly name = "public_host";
  check(url: URL): void {
    const host = url.hostname.toLowerCase();
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
    const isPrivate =
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      (isIp &&
        (host.startsWith("10.") ||
          host.startsWith("192.168.") ||
          host.startsWith("127.") ||
          host.startsWith("169.254.") ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
          host === "0.0.0.0" ||
          host.includes(":")));
    if (isPrivate || !host.includes(".")) {
      throw new ApiError(422, "invalid_url_host", "URL must point to a public website.");
    }
  }
}

class ChatInviteRule implements UrlRule {
  readonly name = "chat_invite";
  check(url: URL): void {
    const host = url.hostname.toLowerCase();
    for (const pattern of CHAT_INVITE_PATTERNS) {
      if (pattern.host.test(host) && (!pattern.path || pattern.path.test(url.pathname))) {
        throw new ApiError(
          422,
          "chat_invite_not_allowed",
          "Chat/invite links are not allowed. List a product website or X handle instead.",
        );
      }
    }
  }
}

class AdultContentRule implements UrlRule {
  readonly name = "adult_content";
  check(url: URL): void {
    const host = url.hostname.toLowerCase();
    if (ADULT_HOST_KEYWORDS.some((keyword) => host.includes(keyword))) {
      throw new ApiError(422, "adult_content_not_allowed", "Adult content is not allowed.");
    }
  }
}

/** Default expander: follows HTTP redirects manually, capped at 5 hops. */
export class HttpRedirectExpander implements RedirectExpander {
  constructor(
    private readonly maxHops = 5,
    private readonly timeoutMs = 5_000,
  ) {}

  async expand(url: URL): Promise<URL> {
    let current = url;
    for (let hop = 0; hop < this.maxHops; hop++) {
      if (!SHORTENER_HOSTS.has(current.hostname.toLowerCase())) return current;
      let response: Response;
      try {
        response = await fetch(current, {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        throw new ApiError(
          422,
          "shortener_unreachable",
          "Could not expand the shortened URL. Submit the destination URL directly.",
        );
      }
      const location = response.headers.get("location");
      if (!location) return current;
      current = new URL(location, current);
    }
    throw new ApiError(422, "too_many_redirects", "Shortened URL redirects too many times.");
  }
}

export interface NormalizedTarget {
  /** Canonical URL: https, no query params, no hash, no trailing slash. */
  url: string;
  /** Suggested display title derived from the URL (host or @handle). */
  suggestedTitle: string;
}

/**
 * Normalizes and validates listing targets — product URLs or X @handles.
 * Rules and the redirect expander are injectable so behavior stays testable
 * and extensible.
 */
export class UrlNormalizer {
  private readonly rules: UrlRule[];

  constructor(
    private readonly expander: RedirectExpander = new HttpRedirectExpander(),
    rules?: UrlRule[],
  ) {
    this.rules =
      rules ?? [new SchemeRule(), new PublicHostRule(), new ChatInviteRule(), new AdultContentRule()];
  }

  async normalize(input: string): Promise<NormalizedTarget> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new ApiError(422, "invalid_url", "targetUrl must not be empty.");
    }

    const handle = this.parseXHandle(trimmed);
    if (handle) {
      return {
        url: `https://x.com/${handle.toLowerCase()}`,
        suggestedTitle: `@${handle}`,
      };
    }

    let url: URL;
    try {
      const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
      url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    } catch {
      throw new ApiError(422, "invalid_url", "targetUrl must be a valid URL or X @handle.");
    }

    for (const rule of this.rules) rule.check(url);
    url = await this.expander.expand(url);
    for (const rule of this.rules) rule.check(url); // re-check the expanded destination

    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "");
    const canonical = `https://${hostname}${url.port ? `:${url.port}` : ""}${pathname}`;
    return { url: canonical, suggestedTitle: hostname.replace(/^www\./, "") };
  }

  /** Accepts "@handle", "x.com/handle", "twitter.com/handle". */
  private parseXHandle(input: string): string | null {
    const direct = input.match(/^@([A-Za-z0-9_]{1,15})$/);
    if (direct) return direct[1];
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (X_HOSTS.has(url.hostname.toLowerCase())) {
        const path = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
        if (path) return path[1];
      }
    } catch {
      // not a URL — fall through
    }
    return null;
  }
}
