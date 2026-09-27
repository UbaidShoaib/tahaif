import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { useCartStore } from "@/stores/cart.store";
import type { CartItemRead } from "@/lib/cart";

vi.mock("@/stores/cart.store", () => ({
  useCartStore: vi.fn(),
}));

const baseItem: CartItemRead = {
  id: "item-1",
  product_id: "p1",
  product_name: "Red Roses Bouquet",
  product_slug: "red-roses-bouquet",
  product_image: null,
  variant_id: null,
  variant_name: "Dozen",
  qty: 2,
  unit_price_pkr: 150000,
  line_total_pkr: 300000,
  delivery_date: null,
  greeting_message: null,
  recipient_name: null,
  recipient_phone: null,
};

describe("CartItemRow", () => {
  const updateItem = vi.fn();
  const removeItem = vi.fn();

  beforeEach(() => {
    updateItem.mockReset();
    removeItem.mockReset();
    vi.mocked(useCartStore).mockReturnValue({ updateItem, removeItem });
  });

  it("shows the product name, variant, quantity and line total", () => {
    render(<CartItemRow item={baseItem} />);
    expect(screen.getByText("Red Roses Bouquet")).toBeInTheDocument();
    expect(screen.getByText("Dozen")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
  });

  it("increases quantity via updateItem", async () => {
    render(<CartItemRow item={baseItem} />);
    await userEvent.click(screen.getByLabelText(/^Increase quantity of /));
    expect(updateItem).toHaveBeenCalledWith("item-1", { qty: 3 });
  });

  it("decreases quantity via updateItem when above 1", async () => {
    render(<CartItemRow item={baseItem} />);
    await userEvent.click(screen.getByLabelText(/^Decrease quantity of /));
    expect(updateItem).toHaveBeenCalledWith("item-1", { qty: 1 });
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("turns the minus button into Remove at quantity 1", async () => {
    render(<CartItemRow item={{ ...baseItem, qty: 1 }} />);
    expect(screen.queryByLabelText(/^Decrease quantity of /)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/^Remove /));
    expect(removeItem).toHaveBeenCalledWith("item-1");
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("removes the item via the trash button", async () => {
    render(<CartItemRow item={baseItem} />);
    await userEvent.click(screen.getByLabelText(/^Remove /));
    expect(removeItem).toHaveBeenCalledWith("item-1");
  });

  it("shows a placeholder emoji when there is no product image", () => {
    render(<CartItemRow item={baseItem} />);
    expect(screen.getByText("🎁")).toBeInTheDocument();
  });
});
