import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodayQueue } from "@/components/vendor/TodayQueue";
import { vendorApi, type VendorFulfillmentRead } from "@/lib/vendor";
import type * as VendorModule from "@/lib/vendor";

vi.mock("@/lib/vendor", async (orig) => {
  const actual = await orig<typeof VendorModule>();
  return { ...actual, vendorApi: { ...actual.vendorApi, listFulfillments: vi.fn(), updateFulfillment: vi.fn() } };
});

const f = (id: string, extra: Partial<VendorFulfillmentRead>): VendorFulfillmentRead => ({
  id, order_id: "o", public_token: "t", order_status: "paid", payment_method: "cod", status: "pending",
  delivery_date: "2026-10-26", delivery_slot: null, recipient_name: "Ammi", recipient_phone: "+92", address_line1: "Gulberg III",
  address_line2: null, city_name: "Lahore", landmark: null, courier_tracking: null, dispatched_at: null, delivered_at: null,
  delivery_photo_url: null, received_by: null, item_count: 1, subtotal_pkr: 1, thanks_token: "x", surprise: false,
  items: [{ product_name: "Truffle Cake", variant_name: "1 lb", qty: 1, greeting_message: "Happy birthday Ammi!", note_token: null }],
  ...extra,
});

describe("TodayQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([
      f("a", { delivery_slot: "6–9 PM", status: "preparing" }),
      f("b", { delivery_slot: "3–6 PM", status: "ready", recipient_name: "Bilal" }),
      f("c", { status: "delivered" }),
      f("tomorrow", { delivery_date: "2026-10-27" }),
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it("shows today's counts and orders by slot, each with its next step", async () => {
    render(<TodayQueue token="tok" />);
    expect(await screen.findByText("Orders today")).toBeInTheDocument();
    expect(screen.getByText("Orders today").nextSibling).toHaveTextContent("3");
    const slots = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(slots).toEqual(["3–6 PM slot", "6–9 PM slot", "Any time today"]);
    const early = screen.getByRole("region", { name: "3–6 PM slot" });
    expect(within(early).getByRole("button", { name: "Hand to rider" })).toBeInTheDocument();
    expect(within(early).getByRole("link", { name: "Print card" })).toHaveAttribute("href", "/vendor/orders/b/cards");
  });

  it("moves an order on with one tap", async () => {
    vi.mocked(vendorApi.updateFulfillment).mockResolvedValue(f("a", { delivery_slot: "6–9 PM", status: "ready" }));
    render(<TodayQueue token="tok" />);
    await userEvent.click(await screen.findByRole("button", { name: "Mark prepared" }));
    expect(vendorApi.updateFulfillment).toHaveBeenCalledWith("a", { status: "ready" }, "tok");
    expect(await screen.findAllByRole("button", { name: "Hand to rider" })).toHaveLength(2);
  });
});
