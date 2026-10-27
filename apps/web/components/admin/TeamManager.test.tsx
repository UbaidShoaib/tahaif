import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeamManager, type Member } from "@/components/admin/TeamManager";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const me: Member = {
  id: "u1", email: "owner@example.com", full_name: "Owner", role: "admin", is_active: true, created_at: "2026-10-01T00:00:00Z",
};
const sara: Member = {
  id: "u2", email: "sara@example.com", full_name: "Sara", role: "staff", is_active: true, created_at: "2026-10-02T00:00:00Z",
};

describe("TeamManager", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useAuthStore.setState({ user: { id: "u1", email: me.email, full_name: "Owner", role: "admin" } as never });
  });

  it("lists the team and keeps your own row read-only", async () => {
    vi.mocked(apiFetch).mockResolvedValue([me, sara]);
    render(<TeamManager token="tok" />);

    expect(await screen.findByText("(you)")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Access for Owner" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Access for Sara" })).toHaveValue("staff");
  });

  it("adds a member by email", async () => {
    vi.mocked(apiFetch).mockImplementation((_path, opts) =>
      Promise.resolve(opts?.method === "POST" ? { ...sara, email: "new@example.com", full_name: null } : [me]) as never);
    render(<TeamManager token="tok" />);

    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), " new@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Add to team" }));

    expect(await screen.findByRole("status")).toHaveTextContent("new@example.com is now staff.");
    expect(apiFetch).toHaveBeenCalledWith("/admin/team", {
      method: "POST", body: { email: "new@example.com", role: "staff" }, token: "tok",
    });
  });

  it("shows why an account can't be added", async () => {
    vi.mocked(apiFetch).mockImplementation((_path, opts) =>
      opts?.method === "POST"
        ? Promise.reject(new ApiError(409, "They haven't verified their email yet."))
        : Promise.resolve([me] as never));
    render(<TeamManager token="tok" />);

    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "x@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add to team" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("haven't verified");
  });

  it("deactivates and changes roles", async () => {
    vi.mocked(apiFetch).mockImplementation((_path, opts) =>
      Promise.resolve((opts?.method === "PATCH" ? sara : [me, sara]) as never));
    render(<TeamManager token="tok" />);

    const row = (await screen.findByText("Sara")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/team/u2", {
      method: "PATCH", body: { is_active: false }, token: "tok",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sara is deactivated and signed out.");

    await userEvent.selectOptions(within(row).getByRole("combobox"), "admin");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/team/u2", {
      method: "PATCH", body: { role: "admin" }, token: "tok",
    }));
  });

  it("asks before taking someone off the team", async () => {
    vi.mocked(apiFetch).mockImplementation((_path, opts) =>
      Promise.resolve((opts?.method === "PATCH" ? sara : [me, sara]) as never));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<TeamManager token="tok" />);

    const row = (await screen.findByText("Sara")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/team/u2", expect.anything());

    await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/team/u2", {
      method: "PATCH", body: { role: "customer" }, token: "tok",
    }));
    confirm.mockRestore();
  });
});
