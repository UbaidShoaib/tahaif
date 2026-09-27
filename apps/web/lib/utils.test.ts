import { describe, it, expect } from "vitest";
import { cn, formatPrice, slugify } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and dedupes conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

// Intl.NumberFormat separates the currency symbol from the amount with a
// non-breaking space (U+00A0); normalize to a plain space for readable assertions.
function normalizeSpaces(s: string): string {
  return s.replace(/\s/g, " ");
}

describe("formatPrice", () => {
  it("converts paisa/cents to major units and formats as PKR by default", () => {
    expect(normalizeSpaces(formatPrice(150000))).toBe("Rs 1,500");
  });

  it("rounds to whole units with no decimals", () => {
    expect(normalizeSpaces(formatPrice(199))).toBe("Rs 2");
  });

  it("supports an explicit currency", () => {
    expect(normalizeSpaces(formatPrice(500000, "USD"))).toBe("US$5,000");
  });

  it("formats zero", () => {
    expect(normalizeSpaces(formatPrice(0))).toBe("Rs 0");
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Chocolate Cake")).toBe("chocolate-cake");
  });

  it("strips punctuation", () => {
    expect(slugify("Mom's Birthday!!")).toBe("moms-birthday");
  });

  it("collapses repeated separators and trims leading/trailing hyphens", () => {
    expect(slugify("  Red -- Roses  ")).toBe("red-roses");
  });
});
