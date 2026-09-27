import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "@/components/catalog/ProductCard";
import type { Product } from "@/lib/catalog";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    vendor_id: "v1",
    category_id: "c1",
    name: "Chocolate Truffle Cake",
    slug: "chocolate-truffle-cake",
    description: null,
    base_price_pkr: 200000,
    is_active: true,
    images: [{ id: "i1", url: "https://example.com/cake.jpg", alt_text: "Cake", sort_order: 0, is_primary: true }],
    product_cities: [
      { city_id: "lahore", price_override_pkr: null, delivery_fee_pkr: 15000, lead_time_hours: 24, same_day_cutoff: null, is_available: true },
    ],
    variants: [],
    vendor: { id: "v1", name: "Layers Bakeshop", slug: "layers-bakeshop" },
    ...overrides,
  };
}

describe("ProductCard", () => {
  it("renders the product name, vendor and base price", () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByText("Chocolate Truffle Cake")).toBeInTheDocument();
    expect(screen.getByText("Layers Bakeshop")).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
  });

  it("links to the product detail page", () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/p/chocolate-truffle-cake");
  });

  it("shows the earliest delivery day when a matching city is provided", async () => {
    render(<ProductCard product={makeProduct()} cityId="lahore" />);
    expect(await screen.findByText(/^Earliest |Same-day delivery/)).toBeInTheDocument();
  });

  it("shows no delivery badge without a chosen city", () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.queryByText(/^Earliest |Same-day delivery/)).not.toBeInTheDocument();
  });

  it("prefixes with 'From' when the cheapest variant still adds a price delta", () => {
    const { container } = render(
      <ProductCard
        product={makeProduct({
          variants: [
            { id: "var1", name: "2lb", price_delta_pkr: 50000, stock_qty: 5, attrs: null, is_active: true },
            { id: "var2", name: "3lb", price_delta_pkr: 100000, stock_qty: 5, attrs: null, is_active: true },
          ],
        })}
      />,
    );
    expect(container.textContent?.replace(/\s/g, " ")).toContain("From Rs 2,500");
  });

  it("says 'From' the cheapest size whenever sizes cost different amounts", () => {
    const { container } = render(
      <ProductCard
        product={makeProduct({
          variants: [
            { id: "var1", name: "1lb", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true },
            { id: "var2", name: "2lb", price_delta_pkr: 50000, stock_qty: 5, attrs: null, is_active: true },
          ],
        })}
      />,
    );
    expect(container.textContent?.replace(/\s/g, " ")).toContain("From Rs 2,000");
  });

  it("omits 'From' when every size costs the same", () => {
    render(
      <ProductCard
        product={makeProduct({
          variants: [
            { id: "var1", name: "Red", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true },
            { id: "var2", name: "White", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true },
          ],
        })}
      />,
    );
    expect(screen.queryByText(/From/)).not.toBeInTheDocument();
  });

  it("uses the city price override when present", () => {
    render(
      <ProductCard
        product={makeProduct({
          product_cities: [
            { city_id: "lahore", price_override_pkr: 250000, delivery_fee_pkr: 15000, lead_time_hours: 12, same_day_cutoff: null, is_available: true },
          ],
        })}
        cityId="lahore"
      />,
    );
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
  });

  it("shows the base price when no city is chosen, matching the API's price filters", () => {
    render(
      <ProductCard
        product={makeProduct({
          product_cities: [
            { city_id: "lahore", price_override_pkr: 250000, delivery_fee_pkr: 15000, lead_time_hours: 12, same_day_cutoff: null, is_available: true },
          ],
        })}
      />,
    );
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
    expect(screen.queryByText(/2,500/)).not.toBeInTheDocument();
  });
});
