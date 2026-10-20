import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductEditor, type EditableProduct } from "@/components/admin/ProductEditor";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const product: EditableProduct = {
  id: "p1",
  vendor_id: "v1",
  category_id: "cat1",
  name: "Red Roses",
  slug: "red-roses",
  description: "Two dozen roses.",
  base_price_pkr: 250000,
  is_active: true,
  images: [
    { id: "i1", url: "https://img.example/1.jpg", alt_text: null, sort_order: 0, is_primary: true },
    { id: "i2", url: "https://img.example/2.jpg", alt_text: null, sort_order: 1, is_primary: false },
  ],
  variants: [
    { id: "va", name: "Dozen", price_delta_pkr: 0, stock_qty: null, is_active: true },
    { id: "vb", name: "Gift box", price_delta_pkr: 150000, stock_qty: 0, is_active: true },
  ],
  occasions: [{ id: "eid", name: "Eid" }],
  product_cities: [
    { city_id: "lhr", price_override_pkr: null, delivery_fee_pkr: 30000, lead_time_hours: 24, same_day_cutoff: "14:00:00", is_available: true },
  ],
  vendor: { id: "v1", name: "Gulberg Florist", slug: "gulberg-florist" },
};

function serve(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((path: string, opts?: { method?: string }) => {
    const key = `${opts?.method ?? "GET"} ${path}`;
    if (key in overrides) {
      const v = overrides[key];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    }
    if (path === "/admin/products/p1") return Promise.resolve(product);
    if (path === "/categories") return Promise.resolve([{ id: "cat1", name: "Flowers" }]);
    if (path === "/occasions") return Promise.resolve([{ id: "eid", name: "Eid" }, { id: "mom", name: "Mother's Day" }]);
    if (path === "/cities") return Promise.resolve([{ id: "lhr", name: "Lahore" }, { id: "khi", name: "Karachi" }]);
    // The Build-your-own section loads on its own.
    if (path === "/admin/products/p1/builder") {
      return Promise.resolve({ product_id: "p1", vendor_id: "v1", builder_kind: null, min_items: 1, max_items: null, components: [] });
    }
    if (path?.startsWith("/admin/products?vendor_id=")) return Promise.resolve([]);
    return Promise.resolve({});
  });
}

describe("ProductEditor", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("loads the product into each section", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    expect(await screen.findByRole("heading", { name: "Red Roses" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Price \(Rs\)/)).toHaveValue("2500");
    expect(screen.getByText("Main photo")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Lahore" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Karachi" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: /View in store/ })).toHaveAttribute("href", "/p/red-roses");
  });

  it("saves details in paisa and clears an emptied description", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);
    const price = await screen.findByLabelText(/Price \(Rs\)/);

    await userEvent.clear(price);
    await userEvent.type(price, "2800");
    await userEvent.clear(screen.getByLabelText("Description"));
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(apiFetch).toHaveBeenCalledWith("/products/red-roses", {
      method: "PATCH",
      token: "tok",
      body: { name: "Red Roses", description: null, base_price_pkr: 280000, category_id: "cat1" },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Details saved.");
  });

  it("rejects a price that isn't whole rupees", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);
    const price = await screen.findByLabelText(/Price \(Rs\)/);

    await userEvent.clear(price);
    await userEvent.type(price, "25.50");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("whole rupees");
    expect(apiFetch).not.toHaveBeenCalledWith("/products/red-roses", expect.anything());
  });

  it("makes another photo the main one", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    await userEvent.click(await screen.findByRole("button", { name: /Make main/ }));

    expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/images/i2/primary", { method: "POST", token: "tok" });
  });

  it("asks before removing a photo", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Remove photo 2" }));
    expect(apiFetch).not.toHaveBeenCalledWith("/products/red-roses/images/i2", expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove" }));

    expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/images/i2", { method: "DELETE", token: "tok" });
  });

  it("saves cities: adds a new one and keeps the existing one's settings", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Karachi" }));
    const karachi = screen.getByRole("group", { name: "Karachi" });
    await userEvent.type(within(karachi).getByLabelText("City price (Rs)"), "3000");
    await userEvent.click(screen.getByRole("button", { name: "Save delivery cities" }));

    expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/cities", {
      method: "PUT",
      token: "tok",
      body: [
        { city_id: "lhr", is_available: true, price_override_pkr: null, delivery_fee_pkr: 30000, lead_time_hours: 24, same_day_cutoff: "14:00" },
        { city_id: "khi", is_available: true, price_override_pkr: 300000, delivery_fee_pkr: 0, lead_time_hours: 24, same_day_cutoff: null },
      ],
    });
  });

  it("switches a city off instead of dropping it", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Lahore" }));
    await userEvent.click(screen.getByRole("button", { name: "Save delivery cities" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/cities", expect.objectContaining({
      body: [expect.objectContaining({ city_id: "lhr", is_available: false })],
    })));
  });

  it("shows a save error in the section that failed", async () => {
    serve({ "PATCH /admin/products/p1/active": new ApiError(403, "Staff only") });
    render(<ProductEditor token="tok" productId="p1" />);

    await userEvent.click(await screen.findByRole("button", { name: /Hide/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Staff only");
  });

  it("explains when the product can't be found", async () => {
    serve({ "GET /admin/products/p1": new ApiError(404, "Product not found") });
    render(<ProductEditor token="tok" productId="p1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Product not found");
    expect(screen.getByRole("link", { name: /All products/ })).toHaveAttribute("href", "/admin?section=products");
  });

  it("shows sizes with their price and stock state", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    expect(await screen.findByLabelText("Dozen stock")).toHaveValue("");
    expect(screen.getByText("Sells at Rs 4,000", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Sold out")).toBeInTheDocument();
  });

  it("restocks a size and sends a cleared count as null", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    const stock = await screen.findByLabelText("Gift box stock");
    await userEvent.clear(stock);
    await userEvent.type(stock, "12");
    const row = stock.closest("li")!;
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/variants/vb", expect.objectContaining({
      method: "PATCH", body: { name: "Gift box", price_delta_pkr: 150000, stock_qty: 12, is_active: true },
    })));

    await userEvent.type(screen.getByLabelText("New size name"), "Half dozen");
    await userEvent.clear(screen.getByLabelText("New size extra price (Rs)"));
    await userEvent.type(screen.getByLabelText("New size extra price (Rs)"), "-800");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/variants", expect.objectContaining({
      method: "POST", body: { name: "Half dozen", price_delta_pkr: -80000, stock_qty: null, is_active: true },
    })));
  });

  it("rejects a stock count that isn't a whole number", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    await userEvent.type(await screen.findByLabelText("New size name"), "Jar");
    await userEvent.type(screen.getByLabelText("New size stock"), "lots");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("stock must be a whole number");
    expect(apiFetch).not.toHaveBeenCalledWith("/products/red-roses/variants", expect.anything());
  });

  it("ticks the product's occasions and saves the full set", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    expect(await screen.findByRole("checkbox", { name: "Eid" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Mother's Day" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Eid" }));
    await userEvent.click(screen.getByRole("button", { name: "Save occasions" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/occasions", expect.objectContaining({
      method: "PUT", body: { occasion_ids: ["mom"] },
    })));
  });

  it("moves a photo and saves the new order", async () => {
    serve();
    render(<ProductEditor token="tok" productId="p1" />);

    expect(await screen.findByRole("button", { name: "Move photo 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move photo 2 later" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move photo 2 earlier" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/images/order", expect.objectContaining({
      method: "PUT", body: { image_ids: ["i2", "i1"] },
    })));
  });
});
