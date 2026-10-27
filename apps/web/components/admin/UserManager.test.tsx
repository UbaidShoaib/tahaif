import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserManager } from "@/components/admin/UserManager";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const me = { id: "u-me", email: "me@example.com", full_name: "Ayesha", phone: null, role: "admin", is_verified: true, created_at: "2026-01-01T00:00:00Z" };
const sara = { ...me, id: "u2", email: "sara@example.com", full_name: null, role: "customer", is_verified: false };
const zain = { ...me, id: "u3", email: "zain@example.com", full_name: null, role: "admin" };

describe("UserManager", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: "u-me", email: "me@example.com", full_name: null, role: "admin" } as never });
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/admin/users") && !path.includes("/role") ? [me, sara, zain] : {}));
  });

  it("shows your own role without letting you change it", async () => {
    render(<UserManager token="t" />);
    expect(await screen.findByText("Admin (you)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for me@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Email not verified")).toBeInTheDocument();
  });

  it("changes someone's role only after confirming the choice", async () => {
    render(<UserManager token="t" />);
    await userEvent.selectOptions(await screen.findByLabelText("Role for sara@example.com"), "staff");
    await userEvent.click(screen.getByRole("button", { name: "Make staff" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/users/u2/role?role=staff", { method: "PATCH", token: "t" });
    expect(await screen.findByText("sara@example.com is now staff.")).toBeInTheDocument();
  });

  it("lets an admin give roles below admin only, and leaves other admins alone", async () => {
    render(<UserManager token="t" />);
    const options = [...(await screen.findByLabelText("Role for sara@example.com")).querySelectorAll("option")].map((o) => o.value);
    expect(options).toEqual(["customer", "vendor", "staff"]);
    expect(screen.queryByLabelText("Role for zain@example.com")).not.toBeInTheDocument();
  });

  it("lets a super admin manage admins too", async () => {
    useAuthStore.setState({ user: { id: "u-me", email: "me@example.com", full_name: null, role: "super_admin" } as never });
    render(<UserManager token="t" />);
    const zainRole = await screen.findByLabelText("Role for zain@example.com");
    expect([...zainRole.querySelectorAll("option")].map((o) => o.value)).toContain("super_admin");
  });

  it("filters by role", async () => {
    render(<UserManager token="t" />);
    await screen.findByText("Admin (you)");
    await userEvent.selectOptions(screen.getByLabelText(/^Role$/), "vendor");
    expect(apiFetch).toHaveBeenLastCalledWith("/admin/users?role=vendor", { token: "t" });
  });
});
