import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductList, productsQuery } from "@/components/admin/ProductList";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const live = {
  id: "p1",
  name: "Red Roses",
  slug: "red-roses",
  vendor_name: "Gulberg Florist",
  base_price_pkr: 250000,
  is_active: true,
  created_at: "2026-10-14T10:00:00Z",
  updated_at: "2026-10-15T10:00:00Z",
  image_url: "https://img.example/roses.jpg",
};
const hidden = { ...live, id: "p2", name: "Pink Peonies", slug: "pink-peonies", is_active: false, image_url: null };

/** Vendors for the shop filter, products for every list load. */
function serve(products: unknown[][]) {
  const queue = [...products];
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === "/vendors") return Promise.resolve([{ id: "v1", name: "Gulberg Florist" }]);
    if (path.startsWith("/admin/products?") || path === "/admin/products") {
      return Promise.resolve(queue.length > 1 ? queue.shift() : queue[0]);
    }
    return Promise.resolve({});
  });
}

describe("productsQuery", () => {
  it("builds the admin list URL from the filters", () => {
    expect(productsQuery("all", "", "")).toBe("/admin/products");
    expect(productsQuery("hidden", " roses ", "v1")).toBe("/admin/products?is_active=false&q=roses&vendor_id=v1");
    expect(productsQuery("live", "", "")).toBe("/admin/products?is_active=true");
  });
});

describe("ProductList", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("lists live and hidden products with an edit link each", async () => {
    serve([[live, hidden]]);
    render(<ProductList token="tok" />);

    expect(await screen.findByText("Red Roses")).toBeInTheDocument();
    const [roses, peonies] = screen.getAllByRole("listitem");
    expect(within(roses).getByText("Live")).toBeInTheDocument();
    expect(within(peonies).getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Pink Peonies" })).toHaveAttribute("href", "/admin/products/p2");
    expect(screen.getByRole("button", { name: /Hide/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish/ })).toBeInTheDocument();
  });

  it("filters to hidden products", async () => {
    serve([[live, hidden]]);
    render(<ProductList token="tok" />);
    await screen.findByText("Red Roses");

    await userEvent.click(screen.getByRole("button", { name: "Hidden" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/products?is_active=false", { token: "tok" }));
  });

  it("searches after typing stops", async () => {
    serve([[live]]);
    render(<ProductList token="tok" />);
    await screen.findByText("Red Roses");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search products" }), "roses");

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/products?q=roses", { token: "tok" }));
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/products?q=r", { token: "tok" });
  });

  it("hides a live product and reloads", async () => {
    serve([[live], [{ ...live, is_active: false }]]);
    render(<ProductList token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: /Hide/ }));

    expect(apiFetch).toHaveBeenCalledWith("/admin/products/p1/active", {
      method: "PATCH", token: "tok", body: { is_active: false },
    });
    expect(await screen.findByRole("button", { name: /Publish/ })).toBeInTheDocument();
  });

  it("says when nothing is hidden", async () => {
    serve([[]]);
    render(<ProductList token="tok" />);
    await userEvent.click(await screen.findByRole("button", { name: "Hidden" }));

    expect(await screen.findByText(/No hidden products/)).toBeInTheDocument();
  });

  it("reports a failed publish", async () => {
    serve([[hidden]]);
    vi.mocked(apiFetch).mockImplementationOnce(() => Promise.resolve([])); // vendors
    render(<ProductList token="tok" />);
    const publish = await screen.findByRole("button", { name: /Publish/ });
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(404, "Product not found"));

    await userEvent.click(publish);

    expect(await screen.findByRole("alert")).toHaveTextContent("Product not found");
  });
});
