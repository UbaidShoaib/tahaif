import { describe, expect, it } from "vitest";
import { swapOrder, wholeNumber, type AdminBuilderComponent } from "@/lib/builders-admin";

const c = (id: string, sort_order: number) => ({ id, sort_order }) as AdminBuilderComponent;

describe("wholeNumber", () => {
  it("accepts whole numbers in range only", () => {
    expect(wholeNumber(" 12 ", 1, 100)).toBe(12);
    expect(wholeNumber("0", 1, 100)).toBeNull();
    expect(wholeNumber("2.5", 1, 100)).toBeNull();
    expect(wholeNumber("", 1, 100)).toBeNull();
  });
});

describe("swapOrder", () => {
  it("swaps neighbours and renumbers from their positions", () => {
    expect(swapOrder([c("a", 0), c("b", 5), c("c", 9)], "b", -1)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
    ]);
  });

  it("does nothing at the ends", () => {
    expect(swapOrder([c("a", 0), c("b", 1)], "a", -1)).toEqual([]);
    expect(swapOrder([c("a", 0), c("b", 1)], "b", 1)).toEqual([]);
  });
});
