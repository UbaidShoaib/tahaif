import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "@/components/layout/Header";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: vi.fn() }));
vi.mock("@/stores/cart.store", () => ({ useCartStore: vi.fn() }));
vi.mock("@/components/cart/CartDrawer", () => ({ CartDrawer: () => null }));
vi.mock("@/components/layout/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/layout/CurrencySelect", () => ({ CurrencySelect: () => null }));

describe("Header", () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({ user: null, logout: vi.fn() });
    vi.mocked(useCartStore).mockReturnValue({ cart: { item_count: 2 }, fetchCart: vi.fn(), openDrawer: vi.fn() });
  });

  it("opens and closes the mobile menu with the category links", async () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(mobileNav).toHaveTextContent("Cakes");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
  });

  it("has a search link and announces the cart count", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Search gifts" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("button", { name: "Cart (2 items)" })).toBeInTheDocument();
  });

  it("renders log-in and sign-up as single links, not buttons nested in links", () => {
    render(<Header />);
    const login = screen.getByRole("link", { name: "Log in" });
    expect(login).toHaveAttribute("href", "/login");
    expect(login.querySelector("button")).toBeNull();
  });
});
