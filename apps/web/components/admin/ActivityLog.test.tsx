import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityLog, changes, entityHref, PAGE_SIZE } from "@/components/admin/ActivityLog";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const entry = {
  id: "a1",
  at: "2026-10-17T10:00:00Z",
  action: "order.status_changed",
  label: "Changed order status",
  entity: "order",
  entity_id: "o1",
  actor_name: "Bilal",
  before: { status: "paid" },
  after: { status: "preparing" },
  ip_address: "39.32.1.10",
};

const page = (items: unknown[], total = items.length) => ({ items, total, offset: 0, limit: PAGE_SIZE });

describe("changes", () => {
  it("describes each changed field, and context fields by value", () => {
    expect(changes({ base_price_pkr: 250000 }, { base_price_pkr: 300000 })).toEqual(["base price pkr: 250000 → 300000"]);
    expect(changes({ is_active: true }, { is_active: false, code: "EID10" })).toEqual(["is active: true → false", "code: EID10"]);
    expect(changes(null, { note: "Called buyer" })).toEqual(["note: Called buyer"]);
  });

  it("links orders and products", () => {
    expect(entityHref("order", "o1")).toBe("/admin/orders/o1");
    expect(entityHref("product", "p1")).toBe("/admin/products/p1");
    expect(entityHref("coupon", "c1")).toBeNull();
  });
});

describe("ActivityLog", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("lists who did what, when and from where", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page([entry]));
    render(<ActivityLog token="tok" />);

    expect(await screen.findByText("Bilal")).toBeInTheDocument();
    expect(screen.getByText(/Changed order status/)).toBeInTheDocument();
    expect(screen.getByText("status: paid → preparing")).toBeInTheDocument();
    expect(screen.getByText(/39\.32\.1\.10/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "open" })).toHaveAttribute("href", "/admin/orders/o1");
  });

  it("filters by what changed and starts again from the newest", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page([entry]));
    render(<ActivityLog token="tok" />);
    await screen.findByText("Bilal");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "product");

    await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith("/admin/audit-log?limit=50&entity=product", { token: "tok" }));
  });

  it("pages to older entries", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page([entry], 120));
    render(<ActivityLog token="tok" />);
    await screen.findByText("Bilal");

    await userEvent.click(screen.getByRole("button", { name: "Older" }));

    await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith("/admin/audit-log?limit=50&offset=50", { token: "tok" }));
  });

  it("shows a refusal", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(403, "Only admins can see the activity log"));
    render(<ActivityLog token="tok" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Only admins");
  });
});
