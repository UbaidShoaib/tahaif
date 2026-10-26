import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SuccessPage from "@/app/checkout/success/[token]/page";
import { cartApi, type OrderRead } from "@/lib/cart";
import type * as CartModule from "@/lib/cart";

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/cart", async (orig) => {
  const actual = await orig<typeof CartModule>();
  return { ...actual, cartApi: { ...actual.cartApi, getOrder: vi.fn() } };
});

const order = (payment: "cod" | "bank_transfer"): OrderRead => ({
  id: "o1", public_token: "ceb4a993-0000", status: "pending_payment", currency: "PKR", total_charged: 650_000,
  subtotal_pkr: 620_000, delivery_pkr: 30_000, discount_pkr: 0, total_pkr: 650_000, placed_at: "2026-11-01T10:00:00Z",
  items: [], payment_method: payment,
  fulfillments: [{
    id: "f1", vendor_name: "Layers", status: "pending", delivery_date: "2026-11-02", delivery_slot: null,
    recipient_name: "Ammi", recipient_phone: "+923001234567", address_line1: "House 12", city_name: "Lahore",
    courier_tracking: null, dispatched_at: null, delivered_at: null,
  }],
});

async function show(payment: "cod" | "bank_transfer") {
  vi.mocked(cartApi.getOrder).mockResolvedValue(order(payment));
  render(await SuccessPage({ params: Promise.resolve({ token: "ceb4a993-0000" }) }));
}

describe("Order confirmation", () => {
  it("thanks the buyer and says whose gift is booked for when", async () => {
    await show("cod");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Thank you. Ammi's gift is booked for Monday 2 November.");
  });

  it("leads with the transfer as the one step left for bank transfer", async () => {
    await show("bank_transfer");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("One step left: send your transfer");
  });

  it("tells cash-on-delivery buyers there's nothing more to do", async () => {
    await show("cod");
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("Nothing more to do");
  });
});
