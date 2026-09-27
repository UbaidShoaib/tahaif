import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariantPicker } from "@/components/catalog/VariantPicker";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { captureEvent } from "@/components/providers";
import type { Product } from "@/lib/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/stores/cart.store", () => ({
  useCartStore: vi.fn(),
}));

vi.mock("@/components/providers", () => ({
  captureEvent: vi.fn(),
}));

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
    images: [],
    product_cities: [],
    variants: [
      { id: "var-1lb", name: "1lb", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true },
      { id: "var-2lb", name: "2lb", price_delta_pkr: 50000, stock_qty: 0, attrs: null, is_active: true },
    ],
    vendor: null,
    ...overrides,
  };
}

describe("VariantPicker", () => {
  const addItem = vi.fn();

  beforeEach(() => {
    push.mockReset();
    addItem.mockReset();
    vi.mocked(captureEvent).mockReset();
    vi.mocked(useCartStore).mockReturnValue({ addItem });
  });

  it("selects the first active variant by default and shows its price", () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    render(<VariantPicker product={makeProduct()} />);
    expect(screen.getByText(/Selected: 1lb/)).toBeInTheDocument();
    expect(screen.getAllByText(/2,000/).length).toBeGreaterThan(0);
  });

  it("disables an out-of-stock variant and says why", () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    render(<VariantPicker product={makeProduct()} />);
    expect(screen.getByRole("radio", { name: /2lb.*Out of stock/ })).toBeDisabled();
  });

  it("switching to a variant updates the displayed total price", async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    render(<VariantPicker product={makeProduct({
      variants: [
        { id: "var-1lb", name: "1lb", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true },
        { id: "var-2lb", name: "2lb", price_delta_pkr: 50000, stock_qty: 5, attrs: null, is_active: true },
      ],
    })} />);

    await userEvent.click(screen.getByRole("radio", { name: "2lb" }));
    expect(screen.getByText(/Selected: 2lb/)).toBeInTheDocument();
    expect(screen.getAllByText(/2,500/).length).toBeGreaterThan(0);
  });

  it("lets guests add to the cart without signing in (ADR 0004)", async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: null });
    addItem.mockResolvedValue(undefined);
    render(<VariantPicker product={makeProduct()} />);

    await userEvent.click(screen.getByRole("button", { name: "Add to Cart" }));

    expect(addItem).toHaveBeenCalledWith({ product_id: "p1", variant_id: "var-1lb", qty: 1 });
    expect(push).not.toHaveBeenCalled();
  });

  it("adds the selected variant to the cart and fires an analytics event when logged in", async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    addItem.mockResolvedValue(undefined);
    render(<VariantPicker product={makeProduct()} />);

    await userEvent.click(screen.getByRole("button", { name: "Add to Cart" }));

    expect(addItem).toHaveBeenCalledWith({
      product_id: "p1",
      variant_id: "var-1lb",
      qty: 1,
    });
    expect(captureEvent).toHaveBeenCalledWith(
      "add_to_cart",
      expect.objectContaining({ product_id: "p1" }),
    );
  });

  it("disables the add-to-cart button when the selected variant is out of stock", () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    render(
      <VariantPicker
        product={makeProduct({
          variants: [
            { id: "var-2lb", name: "2lb", price_delta_pkr: 50000, stock_qty: 0, attrs: null, is_active: true },
          ],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Out of Stock" })).toBeDisabled();
  });

  it("shows an error when adding to the cart fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    addItem.mockRejectedValue(new Error("Cart service unavailable"));
    render(<VariantPicker product={makeProduct()} />);
    await userEvent.click(screen.getByRole("button", { name: /add to cart/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cart service unavailable");
  });

  it("exposes the variants as a radio group", async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    render(
      <VariantPicker
        product={makeProduct({
          variants: [
            { id: "a", name: "1lb", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true },
            { id: "b", name: "2lb", price_delta_pkr: 50000, stock_qty: 5, attrs: null, is_active: true },
          ],
        })}
      />,
    );
    expect(screen.getByRole("radio", { name: "1lb" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "2lb" }));
    expect(screen.getByRole("radio", { name: "2lb" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1lb" })).not.toBeChecked();
  });
});
