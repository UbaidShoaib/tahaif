import { describe, expect, it } from "vitest";
import { cn, formatPrice, slugify } from "./utils";

describe("formatPrice", () => {
  it("converts paisa to whole rupees", () => {
    const formatted = formatPrice(250_000);
    expect(formatted).toContain("2,500");
    expect(formatted).not.toContain(".");
  });

  it("formats other currencies", () => {
    expect(formatPrice(1_999, "GBP")).toContain("20");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("  Red Roses & Chocolates! ")).toBe("red-roses-chocolates");
  });
});

describe("cn", () => {
  it("lets later Tailwind classes win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
