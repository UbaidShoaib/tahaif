import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAuthStore } from "@/stores/auth.store";

const user = (role: string) => ({ id: "u1", email: "a@example.com", full_name: null, role }) as never;

describe("AdminShell", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: user("staff"), accessToken: "tok", isLoading: false });
  });

  it("links back to dashboard sections from other admin pages and marks the current one", () => {
    render(<AdminShell active="products"><p>editor</p></AdminShell>);

    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/admin?section=orders");
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("hides admin-only sections from staff", () => {
    const { rerender } = render(<AdminShell active="orders"><p /></AdminShell>);
    expect(screen.queryByRole("link", { name: "Activity" })).not.toBeInTheDocument();

    useAuthStore.setState({ user: user("admin") });
    rerender(<AdminShell active="orders"><p /></AdminShell>);
    expect(screen.getByRole("link", { name: "Activity" })).toBeInTheDocument();
  });
});
