import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PrintCardsPage from "@/app/vendor/orders/[id]/cards/page";
import { useAuthStore } from "@/stores/auth.store";
import { vendorApi, type VendorFulfillmentRead } from "@/lib/vendor";
import type * as VendorModule from "@/lib/vendor";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "f-1" }) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: vi.fn() }));
vi.mock("@/lib/vendor", async (importOriginal) => {
  const actual = await importOriginal<typeof VendorModule>();
  return { ...actual, vendorApi: { ...actual.vendorApi, getFulfillment: vi.fn() } };
});

const leg = (items: VendorFulfillmentRead["items"]) =>
  ({ id: "f-1", recipient_name: "Ammi Jaan", city_name: "Lahore", items }) as VendorFulfillmentRead;

function renderPage() {
  return render(<PrintCardsPage />);
}

describe("PrintCardsPage", () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({ accessToken: "tok", isLoading: false });
    vi.mocked(vendorApi.getFulfillment).mockReset();
  });

  it("shows one printable card per item with a message", async () => {
    vi.mocked(vendorApi.getFulfillment).mockResolvedValue(
      leg([
        { product_name: "Fudge Cake", variant_name: "2 lb", qty: 1, greeting_message: "Salgirah mubarak Ammi!" },
        { product_name: "Roses", variant_name: null, qty: 1, greeting_message: null },
      ]),
    );
    renderPage();

    expect(await screen.findByText("Salgirah mubarak Ammi!")).toBeInTheDocument();
    expect(screen.getAllByRole("figure", { name: "Card preview" })).toHaveLength(1);
    expect(screen.getByText("Fudge Cake (2 lb)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(vendorApi.getFulfillment).toHaveBeenCalledWith("f-1", "tok");
  });

  it("says so when there are no card messages", async () => {
    vi.mocked(vendorApi.getFulfillment).mockResolvedValue(leg([]));
    renderPage();

    expect(await screen.findByText("This order has no card messages.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
  });
});
