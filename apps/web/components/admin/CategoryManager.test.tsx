import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const base = { sort_order: 0, is_active: true, product_count: 0, child_count: 0 };
const flowers = { ...base, id: "f", parent_id: null, name: "Flowers", slug: "flowers", product_count: 3, child_count: 1 };
const roses = { ...base, id: "r", parent_id: "f", name: "Roses", slug: "roses", is_active: false };
const cakes = { ...base, id: "c", parent_id: null, name: "Cakes", slug: "cakes" };

describe("CategoryManager", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      Promise.resolve(path === "/admin/categories" ? [flowers, roses, cakes] : {}));
  });

  it("lists subcategories under their parent and only offers delete for empty ones", async () => {
    render(<CategoryManager token="t" />);
    expect(await screen.findByRole("button", { name: "Edit Flowers" })).toBeInTheDocument();
    const names = screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(names).toEqual(["Flowers", "↳ Roses", "Cakes"]);
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Flowers" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Cakes" })).toBeInTheDocument();
  });

  it("adds a subcategory under a top-level parent", async () => {
    render(<CategoryManager token="t" />);
    await screen.findByRole("button", { name: "Edit Flowers" });
    await userEvent.type(screen.getByLabelText(/Category name/), "Tulips");
    await userEvent.selectOptions(screen.getByLabelText(/Parent/), "f");
    await userEvent.click(screen.getByRole("button", { name: /Add category/ }));
    expect(apiFetch).toHaveBeenCalledWith("/categories", {
      method: "POST", token: "t", body: { name: "Tulips", slug: "tulips", parent_id: "f", sort_order: 0 },
    });
    expect(await screen.findByText("Tulips added.")).toBeInTheDocument();
  });

  it("moves a subcategory to the top level and shows a hidden one again", async () => {
    render(<CategoryManager token="t" />);
    await screen.findByRole("button", { name: "Edit Flowers" });
    await userEvent.click(screen.getByRole("button", { name: "Show Roses" }));
    expect(apiFetch).toHaveBeenCalledWith("/categories/roses", { method: "PATCH", token: "t", body: { is_active: true } });

    await userEvent.click(screen.getByRole("button", { name: "Edit Roses" }));
    await userEvent.selectOptions(screen.getAllByLabelText(/Parent/)[1], "");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiFetch).toHaveBeenCalledWith("/categories/roses", {
      method: "PATCH", token: "t", body: { name: "Roses", parent_id: null, sort_order: 0 },
    });
  });

  it("rejects a non-numeric menu position without calling the API", async () => {
    render(<CategoryManager token="t" />);
    await screen.findByRole("button", { name: "Edit Flowers" });
    await userEvent.type(screen.getByLabelText(/Category name/), "Mugs");
    const position = screen.getByLabelText(/Menu position/);
    await userEvent.clear(position);
    await userEvent.type(position, "first");
    await userEvent.click(screen.getByRole("button", { name: /Add category/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("whole number");
    expect(apiFetch).not.toHaveBeenCalledWith("/categories", expect.anything());
  });
});
