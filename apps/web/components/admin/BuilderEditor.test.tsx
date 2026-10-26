import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderEditor } from "@/components/admin/BuilderEditor";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import type { AdminBuilderConfig } from "@/lib/builders-admin";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const plain: AdminBuilderConfig = { product_id: "base", vendor_id: "v1", builder_kind: null, min_items: 1, max_items: null, components: [] };
const rose = {
  id: "c1", component_product_id: "rose", name: "Red Rose", slug: "red-rose", image: null, price_pkr: 25000,
  product_is_active: false, role: "stem" as const, max_qty: 12, sort_order: 0, is_active: true,
};
const shop = [
  { id: "base", name: "Bouquet", base_price_pkr: 50000, is_active: true },
  { id: "rose", name: "Red Rose", base_price_pkr: 25000, is_active: false },
  { id: "lily", name: "Lily", base_price_pkr: 35000, is_active: true },
];

function serve(config: AdminBuilderConfig, after: AdminBuilderConfig = config) {
  vi.mocked(apiFetch).mockImplementation((path: string, opts?: { method?: string }) => {
    if (path.startsWith("/admin/products?vendor_id=")) return Promise.resolve(shop);
    if (path === "/admin/products/base/builder" && !opts?.method) return Promise.resolve(config);
    return Promise.resolve(after);
  });
}

const renderEditor = () =>
  render(<BuilderEditor token="t" productId="base" productSlug="byo" vendorId="v1" basePrice={50000} />);

describe("BuilderEditor", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("turns an ordinary product into a bouquet builder", async () => {
    serve(plain, { ...plain, builder_kind: "bouquet", min_items: 3, max_items: 24 });
    renderEditor();
    await userEvent.selectOptions(await screen.findByLabelText("Type"), "bouquet");
    await userEvent.clear(screen.getByLabelText("Least items"));
    await userEvent.type(screen.getByLabelText("Least items"), "3");
    await userEvent.type(screen.getByLabelText(/Most items/), "24");
    await userEvent.click(screen.getByRole("button", { name: "Save builder settings" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/products/base/builder", {
      method: "PUT", token: "t", body: { builder_kind: "bouquet", min_items: 3, max_items: 24 },
    });
    expect(await screen.findByText("Builder settings saved.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try it/ })).toHaveAttribute("href", "/build/byo");
  });

  it("checks numbers before saving", async () => {
    serve(plain);
    renderEditor();
    await userEvent.selectOptions(await screen.findByLabelText("Type"), "hamper");
    await userEvent.type(screen.getByLabelText(/Most items/), "lots");
    await userEvent.click(screen.getByRole("button", { name: "Save builder settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/most items/i);
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/products/base/builder", expect.objectContaining({ method: "PUT" }));
  });

  it("offers only shop products not yet in, and adds one", async () => {
    const builder = { ...plain, builder_kind: "bouquet" as const, components: [rose] };
    serve(builder, { ...builder, components: [rose, { ...rose, id: "c2", component_product_id: "lily", name: "Lily", sort_order: 1 }] });
    renderEditor();
    expect(await screen.findByText("Only in builders")).toBeInTheDocument();
    const picker = screen.getByLabelText("Product");
    const options = [...(picker as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toEqual(["", "lily"]);
    await userEvent.selectOptions(picker, "lily");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/products/base/builder/components", {
      method: "POST", token: "t", body: { component_product_id: "lily", role: "item", max_qty: 10 },
    });
    expect(await screen.findByText("Lily added.")).toBeInTheDocument();
  });

  it("asks before removing an item and shows server errors", async () => {
    const builder = { ...plain, builder_kind: "bouquet" as const, components: [rose] };
    serve(builder);
    vi.mocked(apiFetch).mockImplementation((path: string, opts?: { method?: string }) => {
      if (path.startsWith("/admin/products?")) return Promise.resolve(shop);
      if (opts?.method === "DELETE") return Promise.reject(new ApiError(404, "Item not found"));
      return Promise.resolve(builder);
    });
    renderEditor();
    await userEvent.click(await screen.findByRole("button", { name: "Remove Red Rose" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Item not found"));
  });
});
