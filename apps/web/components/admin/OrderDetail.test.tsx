import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderDetail, type AdminOrder } from "@/components/admin/OrderDetail";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const order: AdminOrder = {
  id: "o1",
  public_token: "3f9a2c1b-0000-4000-8000-000000000000",
  status: "pending_payment",
  currency: "GBP",
  total_charged: 2450,
  subtotal_pkr: 500000,
  delivery_pkr: 30000,
  discount_pkr: 20000,
  total_pkr: 510000,
  placed_at: "2026-10-16T09:00:00Z",
  surprise: true,
  source: "instagram",
  customer_confirmed_at: null,
  items: [{
    id: "i1", product_name: "Chocolate Cake", product_image_url: null, variant_name: "2 lb", qty: 1,
    unit_price_pkr: 500000, line_total_pkr: 500000, greeting_message: "Happy birthday Ammi", has_note: true,
    customization: { flavour: "Dark" },
  }],
  fulfillments: [{
    id: "f1", vendor_name: "Layers Bakeshop", vendor_phone: "+92 42 1234567", status: "pending",
    delivery_date: "2026-10-18", delivery_slot: "2pm–5pm", recipient_name: "Ammi Jaan", recipient_phone: "0300 1234567",
    address_line1: "12 Main Boulevard", address_line2: "Block C", landmark: "Opposite Liberty Market",
    city_name: "Lahore", courier_tracking: null, delivery_photo_url: null, received_by: null,
  }],
  buyer_name: "Sara (London)",
  buyer_email: null,
  buyer_phone: "+447700123456",
  buyer_note: "Call before delivering",
  coupon_code: "EID10",
  source_ref: "@sara.uk",
  campaign: "reel_eid_cakes",
  taken_by: "Ayesha Khan",
  payment: {
    method: "bank_transfer", status: "awaiting_verification", amount_pkr: 510000, amount_charged: 2450,
    currency: "GBP", proof_url: "https://signed.example/r.jpg", provider_ref: null, verified_at: null,
  },
  staff_notes: [{ id: "n1", body: "Buyer called twice.", author_name: "Bilal", created_at: "2026-10-16T10:00:00Z" }],
  timeline: [{ at: "2026-10-16T09:00:00Z", label: "Placed (instagram)" }],
};

function serve(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((path: string, opts?: { method?: string }) => {
    const key = `${opts?.method ?? "GET"} ${path}`;
    if (key in overrides) {
      const v = overrides[key];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    }
    return Promise.resolve(path === "/admin/orders/o1" ? order : {});
  });
}

const section = (name: string) => screen.getByRole("region", { name });

describe("OrderDetail", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows recipient address, shop, items, buyer and payment", async () => {
    serve();
    render(<OrderDetail token="tok" orderId="o1" />);

    expect(await screen.findByRole("heading", { name: "#3F9A2C1B" })).toBeInTheDocument();
    const recipient = section("Recipient");
    expect(within(recipient).getByText("Block C", { exact: false })).toBeInTheDocument();
    expect(within(recipient).getByText("Landmark: Opposite Liberty Market")).toBeInTheDocument();
    expect(within(recipient).getByRole("link", { name: /0300 1234567/ })).toHaveAttribute("href", "tel:03001234567");
    expect(within(recipient).getByText("Layers Bakeshop")).toBeInTheDocument();

    const items = section("Items");
    expect(within(items).getByText("1 × Chocolate Cake (2 lb)")).toBeInTheDocument();
    expect(within(items).getByText("flavour: Dark")).toBeInTheDocument();
    expect(within(items).getByText("Discount (EID10)")).toBeInTheDocument();
    expect(within(items).getByText("Charged")).toBeInTheDocument();

    expect(within(section("Buyer")).getByText("Instagram · @sara.uk")).toBeInTheDocument();
    expect(within(section("Buyer")).getByText(/Call before delivering/)).toBeInTheDocument();
    expect(within(section("Payment")).getByRole("link", { name: /View receipt/ })).toHaveAttribute("href", "https://signed.example/r.jpg");
    expect(within(section("Staff notes")).getByText("Buyer called twice.")).toBeInTheDocument();
    expect(within(section("Timeline")).getByText("Placed (instagram)")).toBeInTheDocument();
  });

  it("adds a staff note and reloads", async () => {
    serve();
    render(<OrderDetail token="tok" orderId="o1" />);

    await userEvent.type(await screen.findByLabelText("Add a note"), "  Deliver after 5pm ");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(apiFetch).toHaveBeenCalledWith("/admin/orders/o1/notes", {
      method: "POST", token: "tok", body: { body: "Deliver after 5pm" },
    });
    expect(screen.getByLabelText("Add a note")).toHaveValue("");
  });

  it("won't save an empty note", async () => {
    serve();
    render(<OrderDetail token="tok" orderId="o1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Write something first.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/orders/o1/notes", expect.anything());
  });

  it("approves the receipt", async () => {
    serve();
    render(<OrderDetail token="tok" orderId="o1" />);

    await userEvent.click(await screen.findByRole("button", { name: /Approve/ }));

    expect(apiFetch).toHaveBeenCalledWith("/admin/orders/o1/verify-payment", {
      method: "POST", token: "tok", body: { verified: true },
    });
  });

  it("changes status and shows a refusal", async () => {
    serve({ "PATCH /admin/orders/o1/status": new ApiError(409, "Can't go back to pending") });
    render(<OrderDetail token="tok" orderId="o1" />);

    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Order status" }), "preparing");

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't go back to pending");
  });

  it("explains a missing order and links back", async () => {
    serve({ "GET /admin/orders/o1": new ApiError(404, "Order not found") });
    render(<OrderDetail token="tok" orderId="o1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Order not found");
    expect(screen.getByRole("link", { name: /All orders/ })).toHaveAttribute("href", "/admin");
  });
});
