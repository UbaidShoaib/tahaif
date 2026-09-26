import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariantPicker } from "@/components/catalog/VariantPicker";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import type { City, Product } from "@/lib/catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: vi.fn() }));
vi.mock("@/stores/cart.store", () => ({ useCartStore: vi.fn() }));
vi.mock("@/components/providers", () => ({ captureEvent: vi.fn() }));

const LHR: City = { id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true };
const KHI: City = { id: "khi", name: "Karachi", slug: "karachi", timezone: "Asia/Karachi", is_active: true };
const ISB: City = { id: "isb", name: "Islamabad", slug: "islamabad", timezone: "Asia/Karachi", is_active: true };

const product: Product = {
  id: "p1", vendor_id: "v1", category_id: "c1", name: "Fudge Cake", slug: "fudge", description: null,
  base_price_pkr: 400_000, is_active: true, images: [], vendor: null, variants: [],
  product_cities: [
    { city_id: "lhr", price_override_pkr: 450_000, delivery_fee_pkr: 25_000, lead_time_hours: 24, same_day_cutoff: "14:00:00", is_available: true },
    { city_id: "khi", price_override_pkr: null, delivery_fee_pkr: 30_000, lead_time_hours: 48, same_day_cutoff: null, is_available: true },
  ],
};

describe("VariantPicker delivery info", () => {
  beforeEach(() => {
    // 10:00 in Pakistan on 26 Sep 2026
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T05:00:00Z"));
    localStorage.clear();
    useDeliveryStore.setState({ cityId: null });
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: "u1" } });
    vi.mocked(useCartStore).mockReturnValue({ addItem: vi.fn(), openDrawer: vi.fn() });
  });
  afterEach(() => vi.useRealTimers());

  it("asks for a city when none is chosen", () => {
    render(<VariantPicker product={product} cities={[LHR, KHI]} />);
    expect(screen.getByText("Choose a city to see the delivery fee and date.")).toBeInTheDocument();
  });

  it("shows the city's price, fee, earliest day and an honest same-day countdown", async () => {
    render(<VariantPicker product={product} cities={[LHR, KHI]} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Deliver to" }), "lhr");

    expect(screen.getByText("Price for delivery in Lahore")).toBeInTheDocument();
    expect(screen.getAllByText(/4,500/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Delivery fee Rs 250/)).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Order within 4h 0m for same-day delivery")).toBeInTheDocument();
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
  });

  it("uses the lead time and no countdown where there is no same-day cutoff", () => {
    useDeliveryStore.setState({ cityId: "khi" });
    render(<VariantPicker product={product} cities={[LHR, KHI]} />);
    expect(screen.getByText(/Delivery fee Rs 300/)).toBeInTheDocument();
    expect(screen.getByText(/^Mon, 28 Sept?$/)).toBeInTheDocument();
    expect(screen.queryByText(/same-day/)).not.toBeInTheDocument();
  });

  it("warns when the buyer's city isn't served, and lists where it is", () => {
    useDeliveryStore.setState({ cityId: "isb" });
    render(<VariantPicker product={product} cities={[LHR, KHI, ISB]} />);
    expect(
      screen.getByText(/isn't delivered to Islamabad\. It's available in Lahore, Karachi\./),
    ).toBeInTheDocument();
  });
});
