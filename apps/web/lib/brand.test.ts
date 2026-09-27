import { describe, expect, it } from "vitest";
import { brand, brandSlug } from "./brand";

describe("brand", () => {
  it("always has a name", () => {
    expect(brand.name.length).toBeGreaterThan(0);
  });

  it("slugifies names for file names", () => {
    expect(brandSlug({ name: "Tahaif Gifts!" })).toBe("tahaif-gifts");
    expect(brandSlug({ name: "تحائف" })).toBe("account");
  });
});
