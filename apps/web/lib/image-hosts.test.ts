import { describe, it, expect } from "vitest";
import { imageHosts, isOptimizable } from "@/lib/image-hosts";

describe("image hosts", () => {
  it("optimises known hosts, including wildcards", () => {
    expect(isOptimizable("https://images.unsplash.com/photo-1?w=800")).toBe(true);
    expect(isOptimizable("https://tahaif-media.s3.amazonaws.com/p/1.jpg")).toBe(true);
    expect(isOptimizable("https://cdn.tahaif.pk/p/1.jpg")).toBe(true);
    expect(isOptimizable("http://localhost:9000/bucket/1.jpg")).toBe(true);
  });

  it("leaves unknown hosts, wrong protocols and bad URLs unoptimised instead of failing", () => {
    expect(isOptimizable("https://vendor-site.example/cake.jpg")).toBe(false);
    expect(isOptimizable("http://images.unsplash.com/x.jpg")).toBe(false);
    expect(isOptimizable("not a url")).toBe(false);
    expect(isOptimizable("https://images.unsplash.com/logo.svg")).toBe(false);
    expect(isOptimizable("https://evil.tahaif.pk.attacker.test/x.jpg")).toBe(false);
  });

  it("adds hosts from NEXT_PUBLIC_IMAGE_HOSTS", () => {
    const hosts = imageHosts(" media.example.net , *.r2.dev ");
    expect(isOptimizable("https://media.example.net/a.jpg", hosts)).toBe(true);
    expect(isOptimizable("https://pub-123.r2.dev/a.jpg", hosts)).toBe(true);
  });
});
