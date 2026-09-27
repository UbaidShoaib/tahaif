import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariantPicker } from "@/components/catalog/VariantPicker";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import type { Product } from "@/lib/catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: vi.fn() }));
vi.mock("@/stores/cart.store", () => ({ useCartStore: vi.fn() }));
vi.mock("@/components/providers", () => ({ captureEvent: vi.fn() }));

const product: Product = {
  id: "p1", vendor_id: "v1", category_id: "c1", name: "Cake", slug: "cake", description: null,
  base_price_pkr: 200000, is_active: true, images: [], product_cities: [], vendor: null,
  variants: [{ id: "var-1", name: "1lb", price_delta_pkr: 0, stock_qty: 5, attrs: null, is_active: true }],
};

describe("VariantPicker greeting card", () => {
  const addItem = vi.fn();

  beforeEach(() => {
    addItem.mockReset().mockResolvedValue(undefined);
    vi.mocked(useCartStore).mockReturnValue({ addItem });
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
  });

  it("sends the trimmed greeting with the cart item and clears the field", async () => {
    render(<VariantPicker product={product} />);
    const field = screen.getByLabelText(/Greeting card message/);

    await userEvent.type(field, "  Happy birthday, Ammi!  ");
    await userEvent.click(screen.getByRole("button", { name: "Add to Cart" }));

    expect(addItem).toHaveBeenCalledWith({
      product_id: "p1", variant_id: "var-1", qty: 1, greeting_message: "Happy birthday, Ammi!",
    });
    expect(field).toHaveValue("");
  });

  it("counts characters against the 500 limit", async () => {
    render(<VariantPicker product={product} />);
    await userEvent.type(screen.getByLabelText(/Greeting card message/), "Hello");
    expect(screen.getByText("5/500")).toBeInTheDocument();
  });
});
