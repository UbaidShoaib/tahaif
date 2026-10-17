import { describe, it, expect } from "vitest";
import { isInStock } from "@/lib/catalog";

describe("isInStock", () => {
  it("treats an uncounted size as always available and 0 as sold out", () => {
    expect(isInStock({ stock_qty: null })).toBe(true);
    expect(isInStock({ stock_qty: 3 })).toBe(true);
    expect(isInStock({ stock_qty: 0 })).toBe(false);
  });
});
