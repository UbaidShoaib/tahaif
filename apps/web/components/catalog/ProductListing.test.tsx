import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductListing } from "@/components/catalog/ProductListing";
import { useDeliveryStore } from "@/stores/delivery.store";
import { fetchListing } from "@/lib/listing";
import type * as ListingModule from "@/lib/listing";
import type { Product } from "@/lib/catalog";

let search = "";
const replace = vi.fn((url: string) => {
  search = url.split("?")[1] ?? "";
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/c/cakes",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/listing", async (orig) => {
  const actual = await orig<typeof ListingModule>();
  return { ...actual, fetchListing: vi.fn() };
});

const prod = (n: number): Product => ({
  id: `p${n}`, vendor_id: "v", category_id: null, name: `Gift ${n}`, slug: `gift-${n}`, description: null,
  base_price_pkr: 100_000 * n, is_active: true, images: [], variants: [], vendor: null, product_cities: [],
});
const page = (from: number, count: number, total: number) => ({
  items: Array.from({ length: count }, (_, i) => prod(from + i)), total, page: 1, page_size: 24,
});

describe("ProductListing", () => {
  beforeEach(() => {
    search = "";
    replace.mockClear();
    vi.mocked(fetchListing).mockReset();
    localStorage.clear();
    useDeliveryStore.setState({
      cityId: null,
      cities: [{ id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true }],
      loadCities: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renders the server's first page without refetching", () => {
    render(<ProductListing initial={page(1, 3, 3)} />);
    expect(screen.getAllByRole("link", { name: /Gift/ })).toHaveLength(3);
    expect(screen.getByText("3 gifts")).toBeInTheDocument();
    expect(fetchListing).not.toHaveBeenCalled();
  });

  it("puts the sort choice in the URL", async () => {
    render(<ProductListing initial={page(1, 3, 3)} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "price_asc");
    expect(replace).toHaveBeenLastCalledWith("/c/cakes?sort=price_asc", { scroll: false });
  });

  it("filters by city and remembers the city", async () => {
    vi.mocked(fetchListing).mockResolvedValue(page(1, 1, 1));
    render(<ProductListing initial={page(1, 3, 3)} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Deliver to" }), "lhr");
    expect(replace).toHaveBeenLastCalledWith("/c/cakes?city_id=lhr", { scroll: false });
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
  });

  it("puts Arrives tomorrow first and only enables it once a city is chosen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T05:00:00Z"));
    vi.mocked(fetchListing).mockResolvedValue(page(1, 3, 3));
    const { rerender } = render(<ProductListing initial={page(1, 3, 3)} />);
    const chip = screen.getByRole("button", { name: "Arrives tomorrow" });
    expect(chip).toBeDisabled();
    search = "city_id=lhr";
    rerender(<ProductListing initial={page(1, 3, 3)} />);
    await userEvent.click(screen.getByRole("button", { name: "Arrives tomorrow" }));
    expect(replace).toHaveBeenLastCalledWith("/c/cakes?city_id=lhr&on=2026-10-27", { scroll: false });
    vi.useRealTimers();
  });

  it("names a chosen day other than tomorrow and clears every filter at once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T05:00:00Z"));
    search = "city_id=lhr&price=under-2000&on=2026-10-29";
    vi.mocked(fetchListing).mockResolvedValue(page(1, 1, 1));
    render(<ProductListing initial={null} />);
    expect(screen.getByRole("button", { name: "Arrives Thu, 29 Oct" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(replace).toHaveBeenLastCalledWith("/c/cakes", { scroll: false });
    vi.useRealTimers();
  });

  it("loads more, appends results and focuses the first new one", async () => {
    vi.mocked(fetchListing).mockResolvedValue(page(3, 2, 4));
    render(<ProductListing initial={page(1, 2, 4)} />);
    expect(screen.getByText("Showing 2 of 4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more gifts" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Gift/ })).toHaveLength(4));
    expect(fetchListing).toHaveBeenCalledWith({}, expect.anything(), 2);
    expect(screen.getByRole("link", { name: /Gift 3/ })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Load more gifts" })).not.toBeInTheDocument();
  });

  it("offers a retry when the API is down", async () => {
    vi.mocked(fetchListing).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(page(1, 1, 1));
    render(<ProductListing initial={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Gift 1/ })).toBeInTheDocument();
  });

  it("explains an empty result and offers to clear filters", async () => {
    search = "price=over-10000";
    vi.mocked(fetchListing).mockResolvedValue(page(1, 0, 0));
    render(<ProductListing initial={null} emptyTitle="No cakes here yet" />);
    expect(await screen.findByRole("heading", { name: "No cakes here yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("on a city page, keeps the city in the path rather than a filter the buyer can change", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T05:00:00Z"));
    vi.mocked(fetchListing).mockResolvedValue(page(1, 3, 3));
    useDeliveryStore.setState({ cityId: "lhr" });
    const gujranwala = { id: "guj", name: "Gujranwala", slug: "gujranwala", timezone: "Asia/Karachi", is_active: true };
    const { rerender } = render(<ProductListing city={gujranwala} initial={page(1, 3, 3)} />);

    expect(screen.queryByRole("combobox", { name: "Deliver to" })).not.toBeInTheDocument();
    expect(screen.getByText("3 gifts delivered in Gujranwala")).toBeInTheDocument();
    // The remembered "Deliver to" city doesn't override the page's city.
    expect(replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Arrives tomorrow" }));
    expect(replace).toHaveBeenLastCalledWith("/c/cakes?on=2026-10-27", { scroll: false });
    rerender(<ProductListing city={gujranwala} initial={page(1, 3, 3)} />);
    await waitFor(() => expect(fetchListing).toHaveBeenLastCalledWith({}, expect.objectContaining({ cityId: "guj", on: "2026-10-27" }), 1));
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
    vi.useRealTimers();
  });

  it("hides Newest when searching, since search is ranked by relevance", () => {
    search = "q=roses";
    render(<ProductListing initial={page(1, 1, 1)} showSearch />);
    expect(screen.queryByRole("option", { name: "Newest" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search gifts" })).toHaveValue("roses");
  });
});
