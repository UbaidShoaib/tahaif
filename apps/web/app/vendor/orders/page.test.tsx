import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VendorOrdersPage from "@/app/vendor/orders/page";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/lib/api";
import { vendorApi, type VendorFulfillmentRead } from "@/lib/vendor";
import type * as VendorModule from "@/lib/vendor";

vi.mock("@/lib/vendor", async (importOriginal) => {
  const actual = await importOriginal<typeof VendorModule>();
  return {
    ...actual,
    vendorApi: { ...actual.vendorApi, listFulfillments: vi.fn(), updateFulfillment: vi.fn() },
  };
});

function leg(overrides: Partial<VendorFulfillmentRead> = {}): VendorFulfillmentRead {
  return {
    id: "f-1",
    order_id: "o-1",
    public_token: "t-1",
    order_status: "pending_payment",
    payment_method: "cod",
    status: "pending",
    delivery_date: "2026-09-27",
    delivery_slot: null,
    recipient_name: "Ammi Jaan",
    recipient_phone: "+923001234567",
    address_line1: "12 Main Boulevard",
    address_line2: null,
    city_name: "Lahore",
    landmark: null,
    courier_tracking: null,
    dispatched_at: null,
    delivered_at: null,
    delivery_photo_url: null,
    received_by: null,
    item_count: 1,
    subtotal_pkr: 280000,
    surprise: false,
    thanks_token: "th-1",
    items: [{ product_name: "Fudge Cake", variant_name: null, qty: 1, greeting_message: null, note_token: null }],
    ...overrides,
  };
}

describe("VendorOrdersPage", () => {
  beforeEach(() => {
    vi.mocked(vendorApi.listFulfillments).mockReset();
    vi.mocked(vendorApi.updateFulfillment).mockReset();
    useAuthStore.setState({ accessToken: "tok", isLoading: false });
  });

  it("offers the next step for a COD order before payment", async () => {
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([leg()]);
    render(<VendorOrdersPage />);

    expect(await screen.findByRole("button", { name: "Mark Preparing" })).toBeInTheDocument();
    expect(screen.queryByText("Awaiting payment")).not.toBeInTheDocument();
  });

  it("holds an unpaid bank-transfer order instead of offering to prepare it", async () => {
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([leg({ payment_method: "bank_transfer" })]);
    render(<VendorOrdersPage />);

    expect(await screen.findByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Mark / })).not.toBeInTheDocument();
  });

  it("offers the next step once a bank transfer is paid", async () => {
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([
      leg({ payment_method: "bank_transfer", order_status: "paid" }),
    ]);
    render(<VendorOrdersPage />);

    expect(await screen.findByRole("button", { name: "Mark Preparing" })).toBeInTheDocument();
  });

  it("shows the API's reason when an update is rejected", async () => {
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([leg()]);
    vi.mocked(vendorApi.updateFulfillment).mockRejectedValue(
      new ApiError(409, "Cannot move fulfillment from delivered to preparing"),
    );
    render(<VendorOrdersPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Mark Preparing" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot move fulfillment");
    expect(vendorApi.updateFulfillment).toHaveBeenCalledWith("f-1", { status: "preparing" }, "tok");
  });

  it("replaces the card with the updated leg on success", async () => {
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([leg()]);
    vi.mocked(vendorApi.updateFulfillment).mockResolvedValue(leg({ status: "preparing" }));
    render(<VendorOrdersPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Mark Preparing" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Ready" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns the rider when the gift is a surprise", async () => {
    vi.mocked(vendorApi.listFulfillments).mockResolvedValue([leg({ surprise: true })]);
    render(<VendorOrdersPage />);

    expect(await screen.findByText(/Surprise gift: don.t call the recipient ahead/)).toBeInTheDocument();
  });
});
