import { describe, expect, it } from "vitest";
import { categoryOptions, nestCategories } from "@/lib/taxonomy-admin";

describe("nestCategories", () => {
  it("puts each subcategory after its parent", () => {
    const flat = [
      { id: "roses", parent_id: "flowers" },
      { id: "cakes", parent_id: null },
      { id: "flowers", parent_id: null },
      { id: "cupcakes", parent_id: "cakes" },
    ];
    expect(nestCategories(flat).map((c) => [c.id, c.depth])).toEqual([
      ["cakes", 0], ["cupcakes", 1], ["flowers", 0], ["roses", 1],
    ]);
  });

  it("shows a subcategory whose parent is missing at the top level", () => {
    expect(nestCategories([{ id: "x", parent_id: "gone" }])).toEqual([{ id: "x", parent_id: "gone", depth: 0 }]);
  });
});

describe("categoryOptions", () => {
  it("flattens the store menu so subcategories can be picked", () => {
    const menu = [{ id: "f", name: "Flowers", children: [{ id: "r", name: "Roses" }] }, { id: "c", name: "Cakes" }];
    expect(categoryOptions(menu)).toEqual([
      { id: "f", name: "Flowers" }, { id: "r", name: "Flowers › Roses" }, { id: "c", name: "Cakes" },
    ]);
  });
});
