import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckoutPage from "@/app/checkout/page";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { useCurrencyStore } from "@/stores/currency.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { ApiError } from "@/lib/api";
import { cartApi, type CheckoutQuote, type CartRead } from "@/lib/cart";
import { accountApi } from "@/lib/account";
import { loyaltyApi } from "@/lib/loyalty";
import type * as CartModule from "@/lib/cart";
import type * as AccountModule from "@/lib/account";
import type * as LoyaltyModule from "@/lib/loyalty";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/providers", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/cart", async (orig) => {
  const actual = await orig<typeof CartModule>();
  return { ...actual, cartApi: { ...actual.cartApi, quote: vi.fn(), place: vi.fn() } };
});
vi.mock("@/lib/account", async (orig) => {
  const actual = await orig<typeof AccountModule>();
  return { ...actual, accountApi: { ...actual.accountApi, listAddresses: vi.fn() } };
});
vi.mock("@/lib/loyalty", async (orig) => {
  const actual = await orig<typeof LoyaltyModule>();
  return { ...actual, loyaltyApi: { ...actual.loyaltyApi, getWallet: vi.fn() } };
});

const LAHORE = { id: "city-lhr", name: "Lahore", slug: "lahore", is_active: true };
const cart: CartRead = {
  id: "c1", item_count: 1, subtotal_pkr: 280_000,
  items: [{
    id: "ci1", product_id: "p1", product_name: "Black Forest Cake", product_slug: "bfc", product_image: null,
    variant_id: null, variant_name: null, qty: 1, unit_price_pkr: 280_000, line_total_pkr: 280_000,
    delivery_date: null, greeting_message: "Happy birthday", recipient_name: null, recipient_phone: null,
  }],
};

function quote(overrides: Partial<CheckoutQuote> = {}): CheckoutQuote {
  return {
    items: [], subtotal_pkr: 280_000, delivery_pkr: 25_000, coupon_code: null, coupon_discount_pkr: 0,
    loyalty_points_used: 0, loyalty_discount_pkr: 0, discount_pkr: 0, total_pkr: 305_000,
    currency: "PKR", fx_rate: "1", total_charged: 305_000, ...overrides,
  };
}

const ns = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ");

describe("CheckoutPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    push.mockReset();
    vi.mocked(cartApi.quote).mockReset().mockResolvedValue(quote());
    vi.mocked(cartApi.place).mockReset();
    vi.mocked(accountApi.listAddresses).mockReset().mockResolvedValue([]);
    vi.mocked(loyaltyApi.getWallet).mockReset().mockResolvedValue({
      balance_points: 0, lifetime_earned: 0, lifetime_burned: 0, updated_at: "",
    });
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => Promise.resolve([LAHORE]) } as Response);
    useAuthStore.setState({ user: { id: "u1" } as never, accessToken: "tok", isLoading: false });
    useCartStore.setState({ cart, fetchCart: vi.fn().mockResolvedValue(undefined) });
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1", GBP: "0.002800" } });
    useDeliveryStore.setState({ cityId: null });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function fillRecipient() {
    await userEvent.type(screen.getByLabelText(/^Recipient name/), "Ammi");
    await userEvent.type(screen.getByLabelText(/^Recipient phone/), "+923001234567");
    await userEvent.type(screen.getByLabelText(/^Address/), "12 Main Boulevard");
  }

  const toPayment = () => userEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

  async function pickLahore() {
    await screen.findByRole("option", { name: "Lahore" });
    await userEvent.selectOptions(screen.getByLabelText(/^Delivery city/), "city-lhr");
    await waitFor(() => expect(cartApi.quote).toHaveBeenCalled());
  }

  it("asks for a city before applying a coupon", async () => {
    render(<CheckoutPage />);
    await userEvent.type(screen.getByLabelText("Coupon code"), "eid10");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a delivery city first");
    expect(cartApi.quote).not.toHaveBeenCalled();
  });

  it("previews a valid coupon's discount from the quote", async () => {
    render(<CheckoutPage />);
    await pickLahore();
    vi.mocked(cartApi.quote).mockResolvedValue(quote({
      coupon_code: "EID10", coupon_discount_pkr: 28_000, discount_pkr: 28_000, total_pkr: 277_000,
    }));

    await userEvent.type(screen.getByLabelText("Coupon code"), "eid10");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(cartApi.quote).toHaveBeenLastCalledWith(
      "city-lhr", "tok", { couponCode: "EID10", useLoyaltyPoints: false, paymentMethod: "cod" },
    ));
    expect(await screen.findByText("Coupon EID10")).toBeInTheDocument();
    expect(ns(screen.getByText(/−Rs 280/).textContent)).toBe("−Rs 280");
  });

  it("explains a rejected coupon and drops it", async () => {
    render(<CheckoutPage />);
    await pickLahore();
    vi.mocked(cartApi.quote).mockImplementation((_c, _t, opts) =>
      opts?.couponCode ? Promise.reject(new ApiError(400, "Coupon has expired")) : Promise.resolve(quote()),
    );

    await userEvent.type(screen.getByLabelText("Coupon code"), "OLD");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Coupon has expired");
    expect(screen.getByLabelText("Coupon code")).toBeInTheDocument(); // input shown again, nothing applied
  });

  it("offers loyalty points only when the buyer has some, and requotes with them", async () => {
    vi.mocked(loyaltyApi.getWallet).mockResolvedValue({ balance_points: 120, lifetime_earned: 120, lifetime_burned: 0, updated_at: "" });
    render(<CheckoutPage />);
    await pickLahore();

    await userEvent.click(await screen.findByLabelText(/Use my 120 loyalty points/));

    await waitFor(() => expect(cartApi.quote).toHaveBeenLastCalledWith(
      "city-lhr", "tok", { couponCode: null, useLoyaltyPoints: true, paymentMethod: "cod" },
    ));
  });

  it("starts from the person a reminder link chose, over the default", async () => {
    const base = {
      recipient_phone: "+923001234567", line1: "12 Main Boulevard", line2: null, city_name: "Lahore",
      landmark: null, alt_phone: null,
    };
    vi.mocked(accountApi.listAddresses).mockResolvedValue([
      { ...base, id: "a1", recipient_name: "Default Person", is_default: true },
      { ...base, id: "a2", recipient_name: "Shabana Khan", is_default: false, relationship: "Ammi" },
    ]);
    useDeliveryStore.setState({ sendToAddressId: "a2" });
    render(<CheckoutPage />);

    await waitFor(() => expect(screen.getByLabelText(/^Recipient name/)).toHaveValue("Shabana Khan"));
    expect(useDeliveryStore.getState().sendToAddressId).toBeNull();
  });

  it("leads saved addresses with who they are", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([
      {
        id: "a1", recipient_name: "Shabana Khan", recipient_phone: "+923001234567", line1: "12 Main Boulevard",
        line2: null, city_name: "Lahore", landmark: null, alt_phone: null, is_default: false, relationship: "Ammi",
      },
    ]);
    render(<CheckoutPage />);
    expect(await screen.findByRole("radio", { name: /Ammi · Shabana Khan/ })).toBeInTheDocument();
  });

  it("fills the form from a saved address, including the city", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([{
      id: "a1", recipient_name: "Ammi Jaan", recipient_phone: "+923001234567", line1: "12 Main Boulevard",
      line2: null, city_name: "Lahore", landmark: "Near Liberty", alt_phone: null, is_default: true,
    }]);
    render(<CheckoutPage />);
    await screen.findByRole("option", { name: "Lahore" });

    await userEvent.click(await screen.findByRole("radio", { name: /Ammi Jaan/ }));

    expect(screen.getByLabelText(/^Recipient name/)).toHaveValue("Ammi Jaan");
    expect(screen.getByLabelText(/^Address/)).toHaveValue("12 Main Boulevard");
    expect(screen.getByLabelText(/^Delivery city/)).toHaveValue("city-lhr");
  });

  it("notes that cash on delivery is paid in rupees when browsing in another currency", async () => {
    useCurrencyStore.setState({ currency: "GBP" });
    render(<CheckoutPage />);
    await pickLahore();
    expect(await screen.findByText(/Cash on delivery is paid in/)).toBeInTheDocument();
    expect(screen.getByText(/≈ £8.54/)).toBeInTheDocument(); // 305 000 paisa × 0.0028
  });

  it("sends the applied coupon and loyalty choice when placing the order", async () => {
    vi.mocked(cartApi.place).mockResolvedValue({ id: "o1", public_token: "t1", total_pkr: 1, payment_method: "cod", items: [] } as never);
    render(<CheckoutPage />);
    await pickLahore();
    await userEvent.type(screen.getByLabelText("Coupon code"), "eid10");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await fillRecipient();
    await toPayment();

    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => expect(cartApi.place).toHaveBeenCalled());
    expect(vi.mocked(cartApi.place).mock.calls[0]?.[0]).toMatchObject({
      delivery_city_id: "city-lhr", coupon_code: "EID10", use_loyalty_points: false,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/success/t1"));
  });

  it("sends the sender name and surprise choice for the recipient messages", async () => {
    vi.mocked(cartApi.place).mockResolvedValue({ id: "o1", public_token: "t1", total_pkr: 1, payment_method: "cod", items: [] } as never);
    render(<CheckoutPage />);
    await pickLahore();
    await fillRecipient();
    await userEvent.type(screen.getByLabelText(/^Your name for the recipient/), "Ali (London)");
    await userEvent.click(screen.getByRole("checkbox", { name: /Keep it a surprise/ }));
    await toPayment();

    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => expect(cartApi.place).toHaveBeenCalled());
    expect(vi.mocked(cartApi.place).mock.calls[0]?.[0]).toMatchObject({ gift_from: "Ali (London)", surprise: true });
  });

  it("shows an error summary and inline errors instead of moving on with an incomplete recipient", async () => {
    render(<CheckoutPage />);
    await screen.findByRole("option", { name: "Lahore" });
    await toPayment();

    const summary = await screen.findByText(/things need fixing/);
    expect(summary.closest('[role="alert"]')).toHaveFocus();
    expect(screen.getByRole("link", { name: /Delivery city: Choose the city/ })).toHaveAttribute("href", "#delivery_city_id");
    expect(screen.getByLabelText(/^Recipient name/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Recipient name/)).toHaveAccessibleDescription("Enter the recipient's full name");
    expect(cartApi.place).not.toHaveBeenCalled();
  });

  it("clears a field's error as soon as it is fixed", async () => {
    render(<CheckoutPage />);
    await pickLahore();
    await toPayment();
    const name = screen.getByLabelText(/^Recipient name/);
    expect(name).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(name, "Ammi");
    await waitFor(() => expect(name).not.toHaveAttribute("aria-invalid"));
  });

  it("chooses the payment method with radio cards and requotes", async () => {
    render(<CheckoutPage />);
    await pickLahore();
    await fillRecipient();
    await toPayment();
    expect(screen.getByRole("radio", { name: /Cash on Delivery/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Bank Transfer/ }));
    expect(screen.getByText("Bank transfer details")).toBeInTheDocument();
    await waitFor(() => expect(cartApi.quote).toHaveBeenLastCalledWith(
      "city-lhr", "tok", { couponCode: null, useLoyaltyPoints: false, paymentMethod: "bank_transfer" },
    ));
  });

  it("reuses the Idempotency-Key when retrying the same order after a failure", async () => {
    vi.mocked(cartApi.place)
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({ id: "o1", public_token: "t1", total_pkr: 1, payment_method: "cod", items: [] } as never);
    render(<CheckoutPage />);
    await pickLahore();
    await fillRecipient();
    await toPayment();

    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));
    expect(await screen.findByText("Network timeout")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => expect(cartApi.place).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(cartApi.place).mock.calls;
    expect(first?.[2]).toBeTruthy();
    expect(second?.[2]).toBe(first?.[2]);
  });

  it("uses a new Idempotency-Key when the order details change", async () => {
    vi.mocked(cartApi.place).mockRejectedValue(new Error("Try again"));
    render(<CheckoutPage />);
    await pickLahore();
    await fillRecipient();
    await toPayment();
    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));
    await screen.findByText("Try again");
    await userEvent.click(screen.getByRole("button", { name: "Edit recipient" }));
    await userEvent.type(screen.getByLabelText(/^Address/), ", Gulberg");
    await toPayment();
    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => expect(cartApi.place).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(cartApi.place).mock.calls;
    expect(second?.[2]).not.toBe(first?.[2]);
  });

  it("shows each gift's card message in the summary", async () => {
    render(<CheckoutPage />);
    await screen.findByRole("option", { name: "Lahore" });
    expect(screen.getAllByText(/Happy birthday/).length).toBeGreaterThan(0);
  });

  it("pre-selects the buyer's Deliver-to city", async () => {
    useDeliveryStore.setState({ cityId: "city-lhr" });
    render(<CheckoutPage />);
    await waitFor(() => expect(cartApi.quote).toHaveBeenCalledWith("city-lhr", "tok", expect.anything()));
  });

  it("starts from the default saved address", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([
      { id: "a0", recipient_name: "Bhai", recipient_phone: "+923110000000", line1: "5 Canal Road", line2: null, city_name: "Lahore", landmark: null, alt_phone: null, is_default: false },
      { id: "a1", recipient_name: "Ammi Jaan", recipient_phone: "+923001234567", line1: "12 Main Boulevard", line2: null, city_name: "Lahore", landmark: null, alt_phone: null, is_default: true },
    ]);
    render(<CheckoutPage />);
    expect(await screen.findByRole("radio", { name: /Ammi Jaan/ })).toBeChecked();
    expect(screen.getByLabelText(/^Recipient name/)).toHaveValue("Ammi Jaan");
    expect(screen.getByLabelText(/^Delivery city/)).toHaveValue("city-lhr");
  });

  it("clears the recipient fields when switching to a new address", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([
      { id: "a1", recipient_name: "Ammi Jaan", recipient_phone: "+923001234567", line1: "12 Main Boulevard", line2: null, city_name: "Lahore", landmark: null, alt_phone: null, is_default: true },
    ]);
    render(<CheckoutPage />);
    await screen.findByDisplayValue("Ammi Jaan");
    await userEvent.click(screen.getByRole("radio", { name: /A new address/ }));
    expect(screen.getByLabelText(/^Recipient name/)).toHaveValue("");
  });

  it("reviews the recipient on the payment step and starts from the day picked for the gift", async () => {
    useCartStore.setState({ cart: { ...cart, items: [{ ...cart.items[0], delivery_date: "2099-01-05" }] } });
    render(<CheckoutPage />);
    await pickLahore();
    expect(screen.getByLabelText(/^Delivery date/)).toHaveValue("2099-01-05");
    await fillRecipient();
    await toPayment();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Pay");
    const review = screen.getByRole("region", { name: "Going to" });
    expect(review).toHaveTextContent("Ammi");
    expect(review).toHaveTextContent("12 Main Boulevard, Lahore");
    expect(review).toHaveTextContent("Arrives Mon, 5 Jan");
  });
});
