import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CouponManager } from "@/components/admin/CouponManager";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const eid = {
  id: "c1", code: "EID25", coupon_type: "percent", value: "25.00", min_order_pkr: 500000, usage_limit: 100,
  per_customer_limit: 1, used_count: 12, is_active: true, starts_at: null, ends_at: "2099-03-01T18:59:00Z",
  created_at: "2026-01-01T00:00:00Z",
};
const old = { ...eid, id: "c2", code: "OLD", coupon_type: "fixed", value: "500.00", min_order_pkr: null, usage_limit: 5, used_count: 5, per_customer_limit: null, ends_at: null };

describe("CouponManager", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/admin/coupons?") || path === "/admin/coupons" ? [eid, old] : {}));
  });

  it("lists coupons with their rules and state", async () => {
    render(<CouponManager token="t" />);
    expect(await screen.findByText("EID25")).toBeInTheDocument();
    expect(screen.getByText(/25% off · orders over .*5,000 · used 12 of 100 · 1 per customer · until 2099-03-01/)).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Used up or ended")).toBeInTheDocument();
  });

  it("creates a first-order coupon in upper case with rupees as paisa", async () => {
    render(<CouponManager token="t" />);
    await screen.findByText("EID25");
    await userEvent.type(screen.getByLabelText(/^Code/), "welcome10");
    await userEvent.type(screen.getByLabelText(/Percent off/), "10");
    await userEvent.type(screen.getByLabelText(/Smallest order/), "2000");
    await userEvent.type(screen.getByLabelText(/Uses per customer/), "1");
    await userEvent.click(screen.getByRole("button", { name: /Create coupon/ }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/coupons", {
      method: "POST", token: "t",
      body: {
        code: "WELCOME10", coupon_type: "percent", value: "10", min_order_pkr: 200000, usage_limit: null,
        per_customer_limit: 1, starts_at: null, ends_at: null,
      },
    });
    expect(await screen.findByText("WELCOME10 is ready to use.")).toBeInTheDocument();
  });

  it("refuses more than 100% off without calling the API", async () => {
    render(<CouponManager token="t" />);
    await screen.findByText("EID25");
    await userEvent.type(screen.getByLabelText(/^Code/), "HUGE");
    await userEvent.type(screen.getByLabelText(/Percent off/), "150");
    await userEvent.click(screen.getByRole("button", { name: /Create coupon/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at most 100%");
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/coupons", expect.objectContaining({ method: "POST" }));
  });

  it("edits limits and switches a coupon off", async () => {
    render(<CouponManager token="t" />);
    await screen.findByText("EID25");
    await userEvent.click(screen.getByRole("button", { name: "Edit EID25" }));
    const total = screen.getAllByLabelText(/Total uses/)[1];
    await userEvent.clear(total);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/coupons/c1", {
      method: "PATCH", token: "t",
      body: {
        value: "25", min_order_pkr: 500000, usage_limit: null, per_customer_limit: 1,
        starts_at: null, ends_at: "2099-03-01T18:59:00.000Z",
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Switch off EID25" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/coupons/c1/active", { method: "PATCH", token: "t", body: { is_active: false } });
  });
});
