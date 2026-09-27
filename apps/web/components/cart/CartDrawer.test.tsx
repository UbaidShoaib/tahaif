import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { useCartStore } from "@/stores/cart.store";
import type { CartRead } from "@/lib/cart";

vi.mock("@/stores/cart.store", () => ({
  useCartStore: vi.fn(),
}));

const closeDrawer = vi.fn();

const item: CartRead["items"][number] = {
  id: "item-1",
  product_id: "p1",
  product_name: "Red Roses",
  product_slug: "red-roses",
  product_image: null,
  variant_id: null,
  variant_name: null,
  qty: 1,
  unit_price_pkr: 100000,
  line_total_pkr: 100000,
  delivery_date: null,
  greeting_message: null,
  recipient_name: null,
  recipient_phone: null,
};

describe("CartDrawer", () => {
  it("shows a loading skeleton while fetching", () => {
    vi.mocked(useCartStore).mockReturnValue({
      cart: null,
      isDrawerOpen: true,
      isFetching: true,
      closeDrawer,
    });
    render(<CartDrawer />);
    const dialog = screen.getByRole("dialog", { name: "Your cart" });
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("shows an empty state with a browse-gifts link when the cart has no items", () => {
    vi.mocked(useCartStore).mockReturnValue({
      cart: { id: "c1", item_count: 0, subtotal_pkr: 0, items: [] },
      isDrawerOpen: true,
      isFetching: false,
      closeDrawer,
    });
    render(<CartDrawer />);
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Gifts" })).toHaveAttribute("href", "/search");
  });

  it("renders cart items and the subtotal footer when the cart has items", () => {
    vi.mocked(useCartStore).mockReturnValue({
      cart: { id: "c1", item_count: 1, subtotal_pkr: 100000, items: [item] },
      isDrawerOpen: true,
      isFetching: false,
      closeDrawer,
    });
    render(<CartDrawer />);
    expect(screen.getByText("Red Roses")).toBeInTheDocument();
    expect(screen.getAllByText(/1,000/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute("href", "/checkout");
  });

  it("shows the item count badge when items are present", () => {
    vi.mocked(useCartStore).mockReturnValue({
      cart: { id: "c1", item_count: 3, subtotal_pkr: 100000, items: [item] },
      isDrawerOpen: true,
      isFetching: false,
      closeDrawer,
    });
    render(<CartDrawer />);
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    vi.mocked(useCartStore).mockReturnValue({
      cart: null,
      isDrawerOpen: false,
      isFetching: false,
      closeDrawer,
    });
    render(<CartDrawer />);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Browse Gifts", hidden: true })).not.toBeInTheDocument();
  });

  it("is a modal dialog that moves focus inside and closes on Escape", async () => {
    closeDrawer.mockClear();
    vi.mocked(useCartStore).mockReturnValue({
      cart: null,
      isDrawerOpen: true,
      isFetching: false,
      closeDrawer,
    });
    render(<CartDrawer />);
    const dialog = screen.getByRole("dialog", { name: "Your cart" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(closeDrawer).toHaveBeenCalled();
  });

  it("closes from the labelled close button", async () => {
    closeDrawer.mockClear();
    vi.mocked(useCartStore).mockReturnValue({
      cart: null,
      isDrawerOpen: true,
      isFetching: false,
      closeDrawer,
    });
    render(<CartDrawer />);
    await userEvent.click(screen.getByRole("button", { name: "Close cart" }));
    expect(closeDrawer).toHaveBeenCalled();
  });
});
