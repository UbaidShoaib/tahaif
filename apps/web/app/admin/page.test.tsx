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
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as Response);
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
    expect(await screen.findByText("Admin Dashboard")).toBeInTheDocument();
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
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as Response);
    useAuthStore.setState({ user: { ...admin } as never, accessToken: "tok", isLoading: false });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("opens on orders and switches to the shop applications queue", async () => {
    render(<AdminDashboard />);
    expect(await screen.findByText("No orders found.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Shop applications" }));

    expect(await screen.findByText("No shop applications are waiting.")).toBeInTheDocument();
    expect(screen.queryByText("No orders found.")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/vendor-applications?status=pending"),
      expect.anything(),
    );
  });

  it("shows hidden products in their own section", async () => {
    render(<AdminDashboard />);

    await userEvent.click(await screen.findByRole("button", { name: "Hidden products" }));

    expect(await screen.findByText(/No hidden products/)).toBeInTheDocument();
  });
});
