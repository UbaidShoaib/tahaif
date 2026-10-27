import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TrackPage from "@/app/track/[token]/page";
import { cartApi, type OrderRead } from "@/lib/cart";
import type * as CartModule from "@/lib/cart";

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/cart", async (orig) => {
  const actual = await orig<typeof CartModule>();
  return { ...actual, cartApi: { ...actual.cartApi, getOrder: vi.fn() } };
});

const delivered: OrderRead = {
  id: "o1", public_token: "ceb4a993-0000", status: "delivered", currency: "PKR", total_charged: 650_000,
  subtotal_pkr: 620_000, delivery_pkr: 30_000, discount_pkr: 0, total_pkr: 650_000, placed_at: "2026-11-01T10:00:00Z",
  payment_method: "cod",
  items: [{
    id: "i1", product_name: "Truffle Cake", variant_name: null, qty: 1, unit_price_pkr: 620_000, line_total_pkr: 620_000,
    greeting_message: "Happy birthday Ammi!",
  } as OrderRead["items"][number]],
  fulfillments: [{
    id: "f1", vendor_name: "Layers", status: "delivered", delivery_date: "2026-11-02", delivery_slot: null,
    recipient_name: "Ammi", recipient_phone: "+923001234567", address_line1: "House 12", city_name: "Lahore",
    courier_tracking: null, dispatched_at: null, delivered_at: "2026-11-02T11:00:00Z",
    delivery_photo_url: "https://example.com/pod.jpg",
  }],
};

describe("Tracking page", () => {
  it("tells the story on one side and keeps the card, summary and help on the other", async () => {
    vi.mocked(cartApi.getOrder).mockResolvedValue(delivered);
    render(await TrackPage({ params: Promise.resolve({ token: "ceb4a993-0000" }) }));
    expect(screen.getByRole("img", { name: "Your gift delivered to Ammi" })).toBeInTheDocument();
    const side = screen.getByRole("complementary", { name: "Card, summary and help" });
    expect(within(side).getByRole("heading", { name: "Your card" })).toBeInTheDocument();
    expect(within(side).getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(within(side).queryByRole("heading", { name: "Progress" })).not.toBeInTheDocument();
  });
});
