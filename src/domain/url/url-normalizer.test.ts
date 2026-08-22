import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { UrlNormalizer, type RedirectExpander } from "./url-normalizer";

/** Expander that never leaves the machine: maps known inputs to destinations. */
class FakeExpander implements RedirectExpander {
  constructor(private readonly map: Record<string, string> = {}) {}
  async expand(url: URL): Promise<URL> {
    const hit = this.map[url.href];
    return hit ? new URL(hit) : url;
  }
}

const normalizer = new UrlNormalizer(new FakeExpander());

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
  throw new Error("expected an ApiError");
}

describe("UrlNormalizer", () => {
  it("strips query params, hashes, and trailing slashes", async () => {
    const result = await normalizer.normalize("https://example.com/product/?utm_source=x#top");
    expect(result.url).toBe("https://example.com/product");
  });

  it("upgrades bare domains to https", async () => {
    const result = await normalizer.normalize("example.com");
    expect(result.url).toBe("https://example.com");
    expect(result.suggestedTitle).toBe("example.com");
  });

  it("canonicalizes X handles", async () => {
    expect((await normalizer.normalize("@SomeAgent")).url).toBe("https://x.com/someagent");
    expect((await normalizer.normalize("https://twitter.com/SomeAgent")).url).toBe(
      "https://x.com/someagent",
    );
    expect((await normalizer.normalize("@SomeAgent")).suggestedTitle).toBe("@SomeAgent");
  });

  it("expands shorteners through the injected expander", async () => {
    const expanding = new UrlNormalizer(
      new FakeExpander({ "https://bit.ly/abc": "https://real-product.com/page?ref=1" }),
    );
    const result = await expanding.normalize("https://bit.ly/abc");
    expect(result.url).toBe("https://real-product.com/page");
  });

  it("rejects chat/invite links, including behind shorteners", async () => {
    expect(await codeOf(normalizer.normalize("https://discord.gg/abc"))).toBe(
      "chat_invite_not_allowed",
    );
    expect(await codeOf(normalizer.normalize("https://t.me/joinchat/xyz"))).toBe(
      "chat_invite_not_allowed",
    );
    const expanding = new UrlNormalizer(
      new FakeExpander({ "https://bit.ly/sneaky": "https://discord.com/invite/abc" }),
    );
    expect(await codeOf(expanding.normalize("https://bit.ly/sneaky"))).toBe(
      "chat_invite_not_allowed",
    );
  });

  it("rejects adult content hosts", async () => {
    expect(await codeOf(normalizer.normalize("https://some-porn-site.com"))).toBe(
      "adult_content_not_allowed",
    );
  });

  it("rejects private/local hosts", async () => {
    expect(await codeOf(normalizer.normalize("http://localhost:3000"))).toBe("invalid_url_host");
    expect(await codeOf(normalizer.normalize("http://192.168.1.1"))).toBe("invalid_url_host");
  });

  it("rejects non-http schemes and garbage", async () => {
    expect(await codeOf(normalizer.normalize("ftp://example.com"))).toBe("invalid_url_scheme");
    expect(await codeOf(normalizer.normalize("   "))).toBe("invalid_url");
  });
});
