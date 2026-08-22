/**
 * Fetches lightweight page metadata (the meta description) for a listing
 * target. Best-effort only: failures return null and never block a bid.
 */
export interface MetadataFetcher {
  description(url: string): Promise<string | null>;
}

const MAX_HTML_BYTES = 120_000;
const MAX_DESCRIPTION_LENGTH = 200;

export class HttpMetadataFetcher implements MetadataFetcher {
  constructor(private readonly timeoutMs = 4_000) {}

  async description(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html", "User-Agent": "agentbid-bot/1.0 (+https://agentbid.lol)" },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("html")) {
        return null;
      }
      const html = await this.readCapped(response);
      const raw =
        this.metaContent(html, /name=["']description["']/i) ??
        this.metaContent(html, /property=["']og:description["']/i);
      if (!raw) return null;
      const text = this.decodeEntities(raw).replace(/\s+/g, " ").trim();
      if (!text) return null;
      return text.length > MAX_DESCRIPTION_LENGTH
        ? `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`
        : text;
    } catch {
      return null;
    }
  }

  private async readCapped(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    void reader.cancel().catch(() => undefined);
    return html;
  }

  /** Finds <meta ... content="..."> where the tag matches `attrPattern`. */
  private metaContent(html: string, attrPattern: RegExp): string | null {
    for (const match of html.matchAll(/<meta\s[^>]*>/gi)) {
      const tag = match[0];
      if (!attrPattern.test(tag)) continue;
      const content = tag.match(/content=["']([^"']*)["']/i);
      if (content?.[1]) return content[1];
    }
    return null;
  }

  private decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x?27;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }
}
