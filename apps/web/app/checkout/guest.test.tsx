import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckoutPage from "@/app/checkout/page";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { useCurrencyStore } from "@/stores/currency.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { cartApi, type CartRead, type CheckoutQuote } from "@/lib/cart";
import type * as CartModule from "@/lib/cart";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/providers", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/cart", async (orig) => {
  const actual = await orig<typeof CartModule>();
  return { ...actual, cartApi: { ...actual.cartApi, quote: vi.fn(), place: vi.fn() } };
});

const LAHORE = { id: "city-lhr", name: "Lahore", slug: "lahore", is_active: true };
const cart: CartRead = {
  id: "c1", item_count: 1, subtotal_pkr: 280_000, guest_token: "g1",
  items: [{
    id: "ci1", product_id: "p1", product_name: "Black Forest Cake", product_slug: "bfc", product_image: null,
    variant_id: null, variant_name: null, qty: 1, unit_price_pkr: 280_000, line_total_pkr: 280_000,
    delivery_date: null, greeting_message: null, recipient_name: null, recipient_phone: null,
  }],
};
const quote: CheckoutQuote = {
  items: [], subtotal_pkr: 280_000, delivery_pkr: 25_000, coupon_code: null, coupon_discount_pkr: 0,
  loyalty_points_used: 0, loyalty_discount_pkr: 0, discount_pkr: 0, total_pkr: 305_000,
  currency: "PKR", fx_rate: "1", total_charged: 305_000,
};

describe("CheckoutPage as a guest (ADR 0004)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    push.mockReset();
    vi.mocked(cartApi.quote).mockReset().mockResolvedValue(quote);
    vi.mocked(cartApi.place).mockReset();
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => Promise.resolve([LAHORE]) } as Response);
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    useCartStore.setState({ cart, fetchCart: vi.fn().mockResolvedValue(undefined) });
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1" } });
    useDeliveryStore.setState({ cityId: "city-lhr" });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function toYourDetails() {
    await screen.findByRole("option", { name: "Lahore" });
    await userEvent.type(screen.getByLabelText(/^Recipient name/), "Ammi");
    await userEvent.type(screen.getByLabelText(/^Recipient phone/), "+923001234567");
    await userEvent.type(screen.getByLabelText(/^Address/), "12 Main Boulevard");
    await userEvent.click(screen.getByRole("button", { name: "Continue to your details" }));
  }

  it("asks for contact details instead of a sign-in wall, and quotes without a token", async () => {
    render(<CheckoutPage />);
    await toYourDetails();
    expect(screen.getByRole("heading", { name: "Your details" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Have an account? Sign in" })).toHaveAttribute("href", "/login?callbackUrl=/checkout");
    await waitFor(() => expect(cartApi.quote).toHaveBeenCalledWith("city-lhr", null, expect.anything()));
  });

  it("requires a valid email and phone from guests", async () => {
    render(<CheckoutPage />);
    await toYourDetails();
    await userEvent.type(screen.getByLabelText(/^Your email/), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(await screen.findByRole("link", { name: /Your email: Enter an email like/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Your phone: Enter a phone number/ })).toBeInTheDocument();
    expect(cartApi.place).not.toHaveBeenCalled();
  });

  it("places the order with the contact details and no account", async () => {
    vi.mocked(cartApi.place).mockResolvedValue({ id: "o1", public_token: "t1", total_pkr: 1, payment_method: "cod", items: [] } as never);
    render(<CheckoutPage />);
    await toYourDetails();
    await userEvent.type(screen.getByLabelText(/^Your email/), "buyer@example.co.uk");
    await userEvent.type(screen.getByLabelText(/^Your phone/), "+44 7700 900123");
    await userEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => expect(cartApi.place).toHaveBeenCalled());
    const [body, token] = vi.mocked(cartApi.place).mock.calls[0] ?? [];
    expect(token).toBeNull();
    expect(body).toMatchObject({ contact_email: "buyer@example.co.uk", contact_phone: "+44 7700 900123", use_loyalty_points: false });
    expect(body).not.toHaveProperty("is_guest");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/success/t1"));
  });

  it("doesn't ask signed-in buyers for contact details or send them", async () => {
    useAuthStore.setState({ user: { id: "u1" } as never, accessToken: "tok", isLoading: false });
    render(<CheckoutPage />);
    await screen.findByRole("option", { name: "Lahore" });
    const steps = screen.getByRole("list", { name: "Checkout steps" });
    expect([...steps.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["1 Recipient", "2 Pay"]);
    expect(screen.queryByRole("heading", { name: "Your details" })).not.toBeInTheDocument();
  });

  it("shows the remembered Deliver-to city in the select once the cities load", async () => {
    render(<CheckoutPage />);
    await screen.findByRole("option", { name: "Lahore" });
    await waitFor(() => expect(screen.getByLabelText(/^Delivery city/)).toHaveValue("city-lhr"));
  });
});

