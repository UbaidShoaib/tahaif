import { describe, it, expect } from "vitest";
// The matcher Next.js itself uses for headers() sources.
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import { canonical, noindexHeaders, requireSiteUrl } from "@/lib/seo";

const noindexed = (path: string) =>
  noindexHeaders().some(({ source }) => pathToRegexp(source, []).test(path));

describe("noindexHeaders", () => {
  it("covers private and token pages and everything beneath them", () => {
    for (const path of ["/track/tok", "/send/addr-1", "/note/tok", "/thanks/tok", "/checkout/success/tok", "/cart", "/search", "/login", "/admin/orders/1", "/vendor/orders"]) {
      expect(noindexed(path), path).toBe(true);
    }
  });

  it("leaves public pages indexable", () => {
    for (const path of ["/", "/p/fudge-cake", "/c/cakes", "/occasion/eid-ul-fitr", "/vendor/sweet-bakery", "/searching", "/contact"]) {
      expect(noindexed(path), path).toBe(false);
    }
  });

  it("sends X-Robots-Tag: noindex", () => {
    expect(noindexHeaders()[0]?.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex" }]);
  });
});

describe("canonical", () => {
  it("points at the given path", () => {
    expect(canonical("/c/cakes")).toEqual({ alternates: { canonical: "/c/cakes" } });
  });
});

describe("requireSiteUrl", () => {
  it("returns the configured origin", () => {
    expect(requireSiteUrl({ NEXT_PUBLIC_SITE_URL: " https://tahaif.pk " })).toBe("https://tahaif.pk");
  });

  it("fails when the origin is missing or blank", () => {
    expect(() => requireSiteUrl({})).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => requireSiteUrl({ NEXT_PUBLIC_SITE_URL: "  " })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
