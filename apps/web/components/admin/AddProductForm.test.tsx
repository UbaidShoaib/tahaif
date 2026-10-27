import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddProductForm, slugify } from "@/components/admin/AddProductForm";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const vendors = [
  { id: "v-partner", name: "Gulberg Florist", owner_user_id: "u1" },
  { id: "v-house", name: "Bouquet Bar", owner_user_id: null },
];
const categories = [{ id: "cat1", name: "Flowers", children: [{ id: "cat2", name: "Roses" }] }];
const cities = [{ id: "lhr", name: "Lahore" }];

function mockLists() {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === "/vendors") return Promise.resolve(vendors);
    if (path === "/categories") return Promise.resolve(categories);
    if (path === "/cities") return Promise.resolve(cities);
    if (path === "/products") return Promise.resolve({ id: "p1", slug: "red-roses", name: "Red Roses" });
    return Promise.resolve({});
  });
}

describe("AddProductForm", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("slugifies product names", () => {
    expect(slugify("  Red Roses & Chocolates! ")).toBe("red-roses-chocolates");
  });

  it("preselects the house vendor", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    expect(await screen.findByRole("option", { name: "Bouquet Bar (house)" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Vendor/)).toHaveValue("v-house");
  });

  it("creates the product, its image and city availability", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    await screen.findByRole("option", { name: "Bouquet Bar (house)" });

    await userEvent.type(screen.getByLabelText(/Product name/), "Red Roses");
    await userEvent.type(screen.getByLabelText(/Price/), "2500");
    const photo = new File(["img"], "roses.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText(/Photo/), photo);
    await userEvent.click(screen.getByLabelText("Lahore"));
    await userEvent.click(screen.getByRole("button", { name: /Add product/ }));

    expect(await screen.findByText(/“Red Roses” is live/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/products", {
      method: "POST",
      token: "tok",
      body: {
        vendor_id: "v-house",
        category_id: null,
        name: "Red Roses",
        slug: "red-roses",
        description: null,
        base_price_pkr: 250000,
      },
    });
    const upload = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/products/red-roses/images/upload");
    const form = upload?.[1]?.body as FormData;
    expect(form.get("file")).toBe(photo);
    expect(form.get("alt_text")).toBe("Red Roses");
    expect(form.get("is_primary")).toBe("true");
    expect(apiFetch).toHaveBeenCalledWith("/products/red-roses/cities", {
      method: "PUT",
      token: "tok",
      body: [{ city_id: "lhr", delivery_fee_pkr: 0, lead_time_hours: 24 }],
    });
  });

  it("rejects a non-numeric price without calling the API", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    await screen.findByRole("option", { name: "Bouquet Bar (house)" });

    await userEvent.type(screen.getByLabelText(/Product name/), "Red Roses");
    await userEvent.type(screen.getByLabelText(/Price/), "25.5");
    await userEvent.click(screen.getByRole("button", { name: /Add product/ }));

    expect(await screen.findByText(/whole rupees/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/products", expect.anything());
  });

  it("reports a duplicate URL name", async () => {
    mockLists();
    vi.mocked(apiFetch).mockImplementationOnce(() => Promise.resolve(vendors))
      .mockImplementationOnce(() => Promise.resolve(categories))
      .mockImplementationOnce(() => Promise.resolve(cities))
      .mockImplementationOnce(() => Promise.reject(new ApiError(409, "Product already exists")));
    render(<AddProductForm token="tok" />);
    await screen.findByRole("option", { name: "Bouquet Bar (house)" });

    await userEvent.type(screen.getByLabelText(/Product name/), "Red Roses");
    await userEvent.type(screen.getByLabelText(/Price/), "2500");
    await userEvent.click(screen.getByRole("button", { name: /Add product/ }));

    expect(await screen.findByText(/Could not create the product: Product already exists/)).toBeInTheDocument();
  });

  it("offers subcategories as well as top-level categories", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    expect(await screen.findByRole("option", { name: "Flowers › Roses" })).toHaveValue("cat2");
  });

  it("sets up a build-your-own bouquet and points to adding its items", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    await screen.findByRole("option", { name: "Bouquet Bar (house)" });

    await userEvent.selectOptions(screen.getByLabelText(/Product type/), "bouquet");
    await userEvent.type(screen.getByLabelText(/Product name/), "Build Your Own Bouquet");
    await userEvent.type(screen.getByLabelText(/Price/), "500");
    const fewest = screen.getByLabelText(/Fewest items/);
    await userEvent.clear(fewest);
    await userEvent.type(fewest, "3");
    await userEvent.type(screen.getByLabelText(/Most items/), "24");
    await userEvent.click(screen.getByRole("button", { name: /Add product/ }));

    expect(await screen.findByText(/set up as a build-your-own bouquet/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/admin/products/p1/builder", {
      method: "PUT", token: "tok", body: { builder_kind: "bouquet", min_items: 3, max_items: 24 },
    });
    expect(screen.getByRole("link", { name: /Add the items buyers can pick/ })).toHaveAttribute(
      "href", "/admin/products/p1#builder-heading",
    );
  });

  it("checks the item limits before creating a builder", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    await screen.findByRole("option", { name: "Bouquet Bar (house)" });

    await userEvent.selectOptions(screen.getByLabelText(/Product type/), "hamper");
    await userEvent.type(screen.getByLabelText(/Product name/), "Hamper");
    await userEvent.type(screen.getByLabelText(/Price/), "800");
    const fewest = screen.getByLabelText(/Fewest items/);
    await userEvent.clear(fewest);
    await userEvent.type(fewest, "5");
    await userEvent.type(screen.getByLabelText(/Most items/), "2");
    await userEvent.click(screen.getByRole("button", { name: /Add product/ }));

    expect(await screen.findByText(/can't be fewer than the fewest/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/products", expect.anything());
  });

  it("does not touch builder settings for a ready-made product", async () => {
    mockLists();
    render(<AddProductForm token="tok" />);
    await screen.findByRole("option", { name: "Bouquet Bar (house)" });
    await userEvent.type(screen.getByLabelText(/Product name/), "Red Roses");
    await userEvent.type(screen.getByLabelText(/Price/), "2500");
    await userEvent.click(screen.getByRole("button", { name: /Add product/ }));
    expect(await screen.findByText(/“Red Roses” is live/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/products/p1/builder", expect.anything());
  });
});
