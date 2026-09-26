import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "@/components/layout/Header";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/layout/DeliveryPicker", () => ({ DeliveryPicker: () => null }));
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

  it("opens the mobile menu as a dialog with the category links, and closes it", async () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    const menu = screen.getByRole("dialog", { name: "Menu" });
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(menu).toContainElement(mobileNav);
    expect(mobileNav).toHaveTextContent("Cakes");
    expect(mobileNav).toHaveTextContent("Birthday");

    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("has a header search box that goes to the results page", () => {
    render(<Header />);
    expect(screen.getByRole("search")).toContainElement(screen.getByRole("searchbox", { name: "Search gifts" }));
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
