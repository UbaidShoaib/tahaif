import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminDashboard from "@/app/admin/page";
import { useAuthStore } from "@/stores/auth.store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const admin = { id: "u1", email: "a@example.com", full_name: null, role: "admin" } as const;

describe("AdminDashboard session handling", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    push.mockReset();
    global.fetch = vi.fn<typeof fetch>().mockImplementation((url) => Promise.resolve({
      ok: true,
      // The order list is paged; every other admin list is a plain array.
      json: () => Promise.resolve(String(url).includes("/admin/orders?") ? { items: [], total: 0, offset: 0, limit: 25 } : []),
    } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("waits for the session to restore instead of redirecting on first render", () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    render(<AdminDashboard />);
    expect(push).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("loads orders once an admin session is restored", async () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    render(<AdminDashboard />);

    act(() => {
      useAuthStore.setState({ user: { ...admin } as never, accessToken: "tok", isLoading: false });
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText("Back office")).toBeInTheDocument();
  });

  it("sends signed-out visitors to login with a callback", async () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    render(<AdminDashboard />);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login?callbackUrl=%2Fadmin"));
  });

  it("sends non-admin users home", async () => {
    useAuthStore.setState({ user: { ...admin, role: "customer" } as never, accessToken: "tok", isLoading: false });
    render(<AdminDashboard />);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});

describe("AdminDashboard sections", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn<typeof fetch>().mockImplementation((url) => Promise.resolve({
      ok: true,
      // The order list is paged; every other admin list is a plain array.
      json: () => Promise.resolve(String(url).includes("/admin/orders?") ? { items: [], total: 0, offset: 0, limit: 25 } : []),
    } as Response));
    useAuthStore.setState({ user: { ...admin } as never, accessToken: "tok", isLoading: false });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("opens on what needs attention and switches to the shop applications queue", async () => {
    render(<AdminDashboard />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Needs attention");
    expect(await screen.findByText(/All clear/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Shop applications" }));

    expect(await screen.findByText("No shop applications are waiting.")).toBeInTheDocument();
    expect(screen.queryByText(/All clear/)).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/vendor-applications?status=pending"),
      expect.anything(),
    );
  });

  it("shows the catalog in the products section", async () => {
    render(<AdminDashboard />);

    await userEvent.click(await screen.findByRole("button", { name: "Products" }));

    expect(await screen.findByRole("searchbox", { name: "Search products" })).toBeInTheDocument();
  });

  it("shows the team and activity log to admins only", async () => {
    render(<AdminDashboard />);
    expect(await screen.findByRole("button", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Team" })).toBeInTheDocument();

    useAuthStore.setState({ user: { ...admin, role: "staff" } as never });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Activity" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Team" })).not.toBeInTheDocument();

    useAuthStore.setState({ user: { ...admin, role: "super_admin" } as never });
    expect(await screen.findByRole("button", { name: "Team" })).toBeInTheDocument();
  });

  it("opens the tab named in ?section=", async () => {
    window.history.replaceState(null, "", "/admin?section=products");
    render(<AdminDashboard />);

    expect(await screen.findByRole("searchbox", { name: "Search products" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });

  it("puts the section in the URL and follows the back button", async () => {
    window.history.replaceState(null, "", "/admin");
    render(<AdminDashboard />);
    await userEvent.click(await screen.findByRole("button", { name: "Reported notes" }));
    expect(window.location.search).toBe("?section=note-reports");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reported notes");
    expect(screen.getByRole("button", { name: "Reported notes" })).toHaveAttribute("aria-current", "page");

    act(() => {
      window.history.replaceState(null, "", "/admin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText(/All clear/)).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });
});
