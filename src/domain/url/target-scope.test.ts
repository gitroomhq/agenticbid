import { describe, expect, it } from "vitest";
import { apexDomain, TargetScopeResolver } from "@/domain/url/target-scope";

const scopes = new TargetScopeResolver();

describe("apexDomain", () => {
  it("collapses subdomains to the registrable domain", () => {
    expect(apexDomain("foo.com")).toBe("foo.com");
    expect(apexDomain("www.foo.com")).toBe("foo.com");
    expect(apexDomain("a.b.foo.com")).toBe("foo.com");
    expect(apexDomain("app.foo.co.uk")).toBe("foo.co.uk");
  });
});

describe("TargetScopeResolver", () => {
  it("a deleted site covers its subdomains, paths, and www variants", () => {
    const deleted = "https://foo.com";
    for (const candidate of [
      "https://foo.com",
      "https://www.foo.com",
      "https://app.foo.com/launch",
      "https://foo.com/pricing",
      "https://foo.com:8080/x",
    ]) {
      expect(scopes.covers(deleted, candidate)).toBe(true);
    }
  });

  it("a deleted deep path covers the whole domain", () => {
    expect(scopes.covers("https://foo.com/some/page", "https://foo.com")).toBe(true);
  });

  it("does not cover other domains", () => {
    expect(scopes.covers("https://foo.com", "https://getfoo.com")).toBe(false);
    expect(scopes.covers("https://foo.com", "https://foo.io")).toBe(false);
    expect(scopes.covers("https://foo.com", "https://notfoo.com")).toBe(false);
  });

  it("a deleted X handle covers only that handle, not all of x.com", () => {
    expect(scopes.covers("https://x.com/nevodavid", "https://x.com/nevodavid")).toBe(true);
    expect(scopes.covers("https://x.com/nevodavid", "https://x.com/NevoDavid")).toBe(true);
    expect(scopes.covers("https://x.com/nevodavid", "https://x.com/someoneelse")).toBe(false);
    expect(scopes.covers("https://x.com/nevodavid", "https://x.com")).toBe(false);
  });
});
