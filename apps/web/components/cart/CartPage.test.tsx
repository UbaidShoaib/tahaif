import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CartPage from "@/app/cart/page";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import type { CartItemRead } from "@/lib/cart";

vi.mock("@/stores/cart.store", () => ({ useCartStore: vi.fn() }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: vi.fn() }));

const line = (id: string, name: string, recipient: string | null, date: string | null): CartItemRead => ({
  id, product_id: id, product_name: name, product_slug: id, product_image: null, variant_id: null, variant_name: null,
  qty: 1, unit_price_pkr: 100_000, line_total_pkr: 100_000, delivery_date: date, greeting_message: null,
  recipient_name: recipient, recipient_phone: null,
});

describe("Cart page", () => {
  it("shows one card per recipient and day", () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: null });
    vi.mocked(useCartStore).mockReturnValue({
      cart: {
        id: "c", item_count: 3, subtotal_pkr: 300_000,
        items: [
          line("a", "Truffle Cake", "Ammi", "2026-11-02"),
          line("b", "Red Roses", "Ammi", "2026-11-02"),
          line("c", "Mithai", null, null),
        ],
      },
      fetchCart: vi.fn(),
      clearCart: vi.fn(),
      isFetching: false,
      updateItem: vi.fn(),
      removeItem: vi.fn(),
      addItem: vi.fn(),
    });
    render(<CartPage />);
    const ammi = screen.getByRole("region", { name: "For Ammi" });
    expect(within(ammi).getByText("Arrives Mon, 2 Nov")).toBeInTheDocument();
    expect(within(ammi).getByRole("link", { name: "Truffle Cake" })).toBeInTheDocument();
    expect(within(ammi).getByRole("link", { name: "Red Roses" })).toBeInTheDocument();
    const rest = screen.getByRole("region", { name: "Gifts" });
    expect(within(rest).getByText("Delivery day chosen at checkout")).toBeInTheDocument();
  });
});
