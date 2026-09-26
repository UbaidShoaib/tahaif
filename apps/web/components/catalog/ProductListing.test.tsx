import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    const sidebar = screen.getByRole("complementary", { name: "Filters" });
    await userEvent.click(within(sidebar).getByRole("radio", { name: "Lahore" }));
    expect(replace).toHaveBeenLastCalledWith("/c/cakes?city_id=lhr", { scroll: false });
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
  });

  it("shows active filter chips that remove one filter or all", async () => {
    search = "city_id=lhr&price=under-2000";
    vi.mocked(fetchListing).mockResolvedValue(page(1, 1, 1));
    render(<ProductListing initial={null} />);
    const chips = screen.getByRole("list", { name: "Active filters" });
    await userEvent.click(within(chips).getByRole("button", { name: "Remove filter: Under Rs 2,000" }));
    expect(replace).toHaveBeenLastCalledWith("/c/cakes?city_id=lhr", { scroll: false });
    await userEvent.click(within(chips).getByRole("button", { name: "Clear all" }));
    expect(replace).toHaveBeenLastCalledWith("/c/cakes", { scroll: false });
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

  it("hides Newest when searching, since search is ranked by relevance", () => {
    search = "q=roses";
    render(<ProductListing initial={page(1, 1, 1)} showSearch />);
    expect(screen.queryByRole("option", { name: "Newest" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search gifts" })).toHaveValue("roses");
  });
});
