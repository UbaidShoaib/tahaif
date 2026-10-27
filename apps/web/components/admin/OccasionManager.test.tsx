import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OccasionManager } from "@/components/admin/OccasionManager";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const eid = {
  id: "o1", slug: "eid", name: "Eid", name_ur: "عید", banner_url: null, starts_at: "2030-02-28T19:00:00Z",
  ends_at: null, sort_order: 0, is_active: true, product_count: 8,
};

describe("OccasionManager", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) => Promise.resolve(path === "/admin/occasions" ? [eid] : {}));
  });

  it("lists occasions with products and dates", async () => {
    render(<OccasionManager token="t" />);
    expect(await screen.findByText(/\/occasion\/eid · 8 products · 2030-03-01 to …/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View/ })).toHaveAttribute("href", "/occasion/eid");
  });

  it("adds an occasion with Pakistan-time dates", async () => {
    render(<OccasionManager token="t" />);
    await screen.findByRole("button", { name: "Edit Eid" });
    await userEvent.type(screen.getAllByLabelText(/^Name/)[0], "Mother's Day");
    await userEvent.type(screen.getAllByLabelText(/First day/)[0], "2030-05-10");
    await userEvent.type(screen.getAllByLabelText(/Last day/)[0], "2030-05-12");
    await userEvent.click(screen.getByRole("button", { name: /Add occasion/ }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/occasions", {
      method: "POST", token: "t",
      body: {
        name: "Mother's Day", name_ur: null, banner_url: null, starts_at: "2030-05-09T19:00:00.000Z",
        ends_at: "2030-05-12T18:59:00.000Z", sort_order: 0, slug: "mother-s-day",
      },
    });
  });

  it("clears the Urdu name on edit and hides an occasion", async () => {
    render(<OccasionManager token="t" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit Eid" }));
    await userEvent.clear(screen.getAllByLabelText(/Urdu name/)[1]);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/occasions/o1", {
      method: "PATCH", token: "t",
      body: { name: "Eid", name_ur: null, banner_url: null, starts_at: "2030-02-28T19:00:00.000Z", ends_at: null, sort_order: 0 },
    });
    await userEvent.click(screen.getByRole("button", { name: "Hide Eid" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/occasions/o1", { method: "PATCH", token: "t", body: { is_active: false } });
  });
});
