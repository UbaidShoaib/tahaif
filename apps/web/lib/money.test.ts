import { describe, it, expect } from "vitest";
import { convertFromPkr, formatMoney, rateToMicros } from "@/lib/money";

const ns = (s: string) => s.replace(/ /g, " ");

describe("rateToMicros", () => {
  it("parses decimal strings exactly", () => {
    expect(rateToMicros("0.002800")).toBe(2_800);
    expect(rateToMicros("1")).toBe(1_000_000);
    expect(rateToMicros("0.0135")).toBe(13_500);
  });

  it("rejects malformed rates", () => {
    expect(() => rateToMicros("abc")).toThrow();
  });
});

describe("convertFromPkr", () => {
  it("matches the API's half-up rounding", () => {
    expect(convertFromPkr(95_000, "0.0135")).toBe(1_283); // 1 282.5 → 1 283
    expect(convertFromPkr(535_000, "0.0028")).toBe(1_498);
  });

  it("returns PKR amounts unchanged at rate 1", () => {
    expect(convertFromPkr(12_345, "1")).toBe(12_345);
  });
});

describe("formatMoney", () => {
  it("shows whole rupees and two-decimal foreign amounts", () => {
    expect(ns(formatMoney(150_000, "PKR"))).toBe("Rs 1,500");
    expect(ns(formatMoney(1_498, "GBP"))).toBe("£14.98");
  });
});
