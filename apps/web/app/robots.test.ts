import { describe, it, expect } from "vitest";
import robots from "@/app/robots";
import { brand } from "@/lib/brand";

describe("robots.txt", () => {
  const [rule] = [robots().rules].flat();

  it("lets crawlers fetch the JS and CSS pages need to render", () => {
    expect(rule?.disallow).not.toContain("/_next/");
  });

  it("does not block token pages, so their noindex header is seen", () => {
    for (const path of ["/track/", "/send/", "/note/", "/thanks/", "/checkout/"]) {
      expect(rule?.disallow).not.toContain(path);
    }
  });

  it("never runs the bucket builder, which creates a bucket, but can see shared bucket links", () => {
    expect(rule?.disallow).toContain("/build/");
    expect(rule?.allow).toContain("/build/b/");
  });

  it("keeps crawlers out of signed-in areas and points at the sitemap", () => {
    expect(rule?.disallow).toEqual(expect.arrayContaining(["/admin/", "/account/", "/vendor/dashboard"]));
    expect(robots().sitemap).toBe(`${brand.siteUrl}/sitemap.xml`);
  });
});
