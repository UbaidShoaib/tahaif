import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HiddenProducts } from "@/components/admin/HiddenProducts";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const product = {
  id: "p1",
  name: "Pink Peonies",
  slug: "pink-peonies",
  vendor_name: "Gulberg Florist",
  base_price_pkr: 250000,
  is_active: false,
  created_at: "2026-10-14T10:00:00Z",
};

describe("HiddenProducts", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("lists hidden products with their shop and price", async () => {
    vi.mocked(apiFetch).mockResolvedValue([product]);
    render(<HiddenProducts token="tok" />);

    expect(await screen.findByText("Pink Peonies")).toBeInTheDocument();
    expect(screen.getByText(/Gulberg Florist · .*2,500/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/admin/products?is_active=false", { token: "tok" });
  });

  it("says so when the whole catalog is live", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(<HiddenProducts token="tok" />);

    expect(await screen.findByText(/No hidden products/)).toBeInTheDocument();
  });

  it("publishes a product and reloads the list", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([product]).mockResolvedValueOnce({}).mockResolvedValueOnce([]);
    render(<HiddenProducts token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/No hidden products/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/admin/products/p1/active", {
      method: "PATCH",
      token: "tok",
      body: { is_active: true },
    });
  });

  it("reports a failed publish and keeps the product listed", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([product]).mockRejectedValueOnce(new ApiError(404, "Product not found"));
    render(<HiddenProducts token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Product not found");
    expect(screen.getByText("Pink Peonies")).toBeInTheDocument();
  });
});
