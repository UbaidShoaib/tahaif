import { describe, it, expect, vi, beforeEach } from "vitest";
import { cartApi, type CartRead } from "@/lib/cart";
import type * as CartModule from "@/lib/cart";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";

vi.mock("@/lib/cart", async () => {
  const actual = await vi.importActual<typeof CartModule>("@/lib/cart");
  return {
    ...actual,
    cartApi: {
      get: vi.fn(),
      addItem: vi.fn(),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  };
});

const emptyCart: CartRead = { id: "cart-1", item_count: 0, subtotal_pkr: 0, items: [] };
const filledCart: CartRead = { id: "cart-1", item_count: 1, subtotal_pkr: 50000, items: [] };

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ cart: null, isDrawerOpen: false, isFetching: false });
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    vi.mocked(cartApi.get).mockReset();
    vi.mocked(cartApi.addItem).mockReset();
    vi.mocked(cartApi.updateItem).mockReset();
    vi.mocked(cartApi.removeItem).mockReset();
    vi.mocked(cartApi.clear).mockReset();
  });

  it("fetchCart is a no-op when the user is unauthenticated", async () => {
    await useCartStore.getState().fetchCart();
    expect(cartApi.get).not.toHaveBeenCalled();
    expect(useCartStore.getState().cart).toBeNull();
  });

  it("fetchCart loads the cart when a token is present", async () => {
    useAuthStore.setState({ accessToken: "token-1" });
    vi.mocked(cartApi.get).mockResolvedValue(filledCart);

    await useCartStore.getState().fetchCart();

    expect(cartApi.get).toHaveBeenCalledWith("token-1");
    expect(useCartStore.getState().cart).toEqual(filledCart);
    expect(useCartStore.getState().isFetching).toBe(false);
  });

  it("fetchCart silently swallows errors (e.g. not logged in server-side)", async () => {
    useAuthStore.setState({ accessToken: "token-1" });
    vi.mocked(cartApi.get).mockRejectedValue(new Error("401"));

    await expect(useCartStore.getState().fetchCart()).resolves.toBeUndefined();
    expect(useCartStore.getState().isFetching).toBe(false);
  });

  it("addItem adds to the cart without opening the drawer", async () => {
    useAuthStore.setState({ accessToken: "token-1" });
    vi.mocked(cartApi.addItem).mockResolvedValue(filledCart);

    await useCartStore.getState().addItem({ product_id: "p1", qty: 1 });

    expect(cartApi.addItem).toHaveBeenCalledWith({ product_id: "p1", qty: 1 }, "token-1");
    expect(useCartStore.getState().cart).toEqual(filledCart);
    // The toast's "View cart" opens the drawer; adding alone doesn't (it would steal focus).
    expect(useCartStore.getState().isDrawerOpen).toBe(false);
  });

  it("addItem works for guests (no sign-in needed, ADR 0004)", async () => {
    vi.mocked(cartApi.addItem).mockResolvedValue(filledCart);
    await useCartStore.getState().addItem({ product_id: "p1", qty: 1 });
    expect(cartApi.addItem).toHaveBeenCalledWith({ product_id: "p1", qty: 1 }, null);
    expect(useCartStore.getState().cart).toEqual(filledCart);
  });

  it("fetchCart loads a guest cart when this browser holds a guest cart token", async () => {
    localStorage.setItem("tahaif_cart_token", "guest-tok");
    vi.mocked(cartApi.get).mockResolvedValue(filledCart);
    await useCartStore.getState().fetchCart();
    expect(cartApi.get).toHaveBeenCalledWith(null);
    localStorage.removeItem("tahaif_cart_token");
  });

  it("removeItem updates the cart from the server response", async () => {
    useAuthStore.setState({ accessToken: "token-1" });
    vi.mocked(cartApi.removeItem).mockResolvedValue(emptyCart);

    await useCartStore.getState().removeItem("item-1");

    expect(cartApi.removeItem).toHaveBeenCalledWith("item-1", "token-1");
    expect(useCartStore.getState().cart).toEqual(emptyCart);
  });

  it("openDrawer / closeDrawer toggle drawer state", () => {
    useCartStore.getState().openDrawer();
    expect(useCartStore.getState().isDrawerOpen).toBe(true);
    useCartStore.getState().closeDrawer();
    expect(useCartStore.getState().isDrawerOpen).toBe(false);
  });
});
