import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuilderList } from "@/components/admin/BuilderList";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const builder = {
  product_id: "p1", name: "Build Your Own Bouquet", slug: "byo-bouquet", vendor_name: "Gulberg Florist",
  builder_kind: "bouquet", is_active: true, base_price_pkr: 50000, min_items: 3, max_items: 24,
  component_count: 5, bucket_count: 2,
};

describe("BuilderList", () => {
  it("lists builders with edit and open links", async () => {
    vi.mocked(apiFetch).mockResolvedValue([builder, { ...builder, product_id: "p2", name: "Empty Hamper", slug: "h", component_count: 0, is_active: false, min_items: 1, max_items: null, bucket_count: 0 }]);
    render(<BuilderList token="t" />);
    expect(await screen.findByText("Build Your Own Bouquet")).toBeInTheDocument();
    expect(screen.getByText(/3–24 items · 2 started/)).toBeInTheDocument();
    expect(screen.getByText("No items yet")).toBeInTheDocument();
    const open = screen.getAllByRole("link", { name: /Open/ });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveAttribute("href", "/build/byo-bouquet");
    expect(screen.getAllByRole("link", { name: /Edit/ })[1]).toHaveAttribute("href", "/admin/products/p2");
  });
});
