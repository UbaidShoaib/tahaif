import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroFinder } from "@/components/home/HeroFinder";
import { SameDayRail } from "@/components/home/SameDayRail";
import { useDeliveryStore } from "@/stores/delivery.store";
import { fetchListing } from "@/lib/listing";
import type * as ListingModule from "@/lib/listing";
import type { Product, ProductCity } from "@/lib/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/listing", async (orig) => {
  const actual = await orig<typeof ListingModule>();
  return { ...actual, fetchListing: vi.fn() };
});

const LHR = { id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true };
const pc = (cutoff: string | null): ProductCity => ({
  city_id: "lhr", price_override_pkr: null, delivery_fee_pkr: 25_000, lead_time_hours: 24, same_day_cutoff: cutoff, is_available: true,
});
const prod = (id: string, cutoff: string | null): Product => ({
  id, vendor_id: "v", category_id: null, name: `Gift ${id}`, slug: id, description: null, base_price_pkr: 100_000,
  is_active: true, images: [], variants: [], vendor: null, product_cities: [pc(cutoff)],
});

beforeEach(() => {
  push.mockReset();
  vi.mocked(fetchListing).mockReset();
  localStorage.clear();
  useDeliveryStore.setState({ cities: [LHR], cityId: null, loadCities: vi.fn().mockResolvedValue(undefined) });
});

describe("HeroFinder", () => {
  it("sets the Deliver-to city and opens gifts for it", async () => {
    render(<HeroFinder />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Deliver to" }), "lhr");
    await userEvent.click(screen.getByRole("button", { name: "Find gifts" }));
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
    expect(push).toHaveBeenCalledWith("/search?city_id=lhr");
  });

  it("browses everything when no city is chosen", async () => {
    render(<HeroFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Find gifts" }));
    expect(push).toHaveBeenCalledWith("/search");
  });
});

describe("SameDayRail", () => {
  afterEach(() => vi.useRealTimers());

  it("is hidden without a chosen city", () => {
    const { container } = render(<SameDayRail />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchListing).not.toHaveBeenCalled();
  });

  it("lists only gifts that can still arrive today, with the soonest cutoff", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T05:00:00Z")); // 10:00 in Lahore
    useDeliveryStore.setState({ cityId: "lhr" });
    vi.mocked(fetchListing).mockResolvedValue({
      items: [prod("a", "14:00:00"), prod("b", null), prod("c", "12:30:00"), prod("d", "09:00:00")],
      total: 4, page: 1, page_size: 24,
    });
    render(<SameDayRail />);
    expect(await screen.findByRole("heading", { name: "Same-day delivery in Lahore" })).toBeInTheDocument();
    expect(screen.getByText("Order within 2h 30m for delivery today")).toBeInTheDocument();
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Gift a", "Gift c"]);
  });

  it("stays hidden when nothing qualifies right now", async () => {
    useDeliveryStore.setState({ cityId: "lhr" });
    vi.mocked(fetchListing).mockResolvedValue({ items: [prod("b", null)], total: 1, page: 1, page_size: 24 });
    const { container } = render(<SameDayRail />);
    await vi.waitFor(() => expect(fetchListing).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
