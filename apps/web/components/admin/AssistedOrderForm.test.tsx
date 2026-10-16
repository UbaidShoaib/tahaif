import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistedOrderForm } from "@/components/admin/AssistedOrderForm";
import { ApiError } from "@/lib/api";
import { catalogApi } from "@/lib/catalog";
import { socialOrdersApi } from "@/lib/social-orders";
import type * as SocialModule from "@/lib/social-orders";

vi.mock("@/lib/catalog", () => ({ catalogApi: { getCities: vi.fn(), getProducts: vi.fn() } }));
vi.mock("@/lib/social-orders", async () => {
  const actual = await vi.importActual<typeof SocialModule>("@/lib/social-orders");
  return { ...actual, socialOrdersApi: { create: vi.fn(), markSent: vi.fn(), messages: vi.fn() } };
});

const product = {
  id: "p1", vendor_id: "v1", category_id: null, name: "Chocolate Cake 2lb", slug: "choc", description: null,
  base_price_pkr: 350000, is_active: true, images: [], product_cities: [], variants: [], vendor: null,
};

async function fillRequired() {
  await userEvent.selectOptions(await screen.findByLabelText(/^City/), "c1");
  await userEvent.selectOptions(await screen.findByLabelText(/^Product 1/), "p1");
  await userEvent.type(screen.getByLabelText(/WhatsApp number/), "+44 7700 900123");
  await userEvent.type(screen.getByLabelText(/^Name/), "Ammi Jaan");
  await userEvent.type(screen.getByLabelText(/^Phone/), "0300 1234567");
  await userEvent.type(screen.getByLabelText(/^Address/), "12 Main Boulevard, Gulberg");
}

// userEvent types every character; under a full parallel run the default 5 s is tight.
describe("AssistedOrderForm", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.mocked(catalogApi.getCities).mockResolvedValue([
      { id: "c1", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true },
    ]);
    vi.mocked(catalogApi.getProducts).mockResolvedValue({ items: [product], total: 1, page: 1, page_size: 100 });
    vi.mocked(socialOrdersApi.create).mockReset();
  });

  it("places the order and shows the WhatsApp messages to send", async () => {
    vi.mocked(socialOrdersApi.create).mockResolvedValue({
      order: { id: "o1", public_token: "1a2b3c4d-0000", total_pkr: 370000 } as never,
      messages: [{ kind: "order_summary", label: "Send order summary", text: "hi", url: "https://wa.me/1", due: true, sent_at: null }],
    });
    render(<AssistedOrderForm token="tok" />);
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    const [body, token] = vi.mocked(socialOrdersApi.create).mock.calls[0];
    expect(token).toBe("tok");
    expect(body).toMatchObject({
      source: "instagram",
      buyer_phone: "+44 7700 900123",
      delivery_city_id: "c1",
      payment_method: "bank_transfer",
      items: [{ product_id: "p1", qty: 1, variant_id: null }],
      allow_duplicate: false,
    });
    expect(await screen.findByText(/Order #1A2B3C4D placed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send order summary/ })).toBeInTheDocument();
  });

  it("blocks cash on delivery for a surprise", async () => {
    render(<AssistedOrderForm token="tok" />);
    await fillRequired();
    await userEvent.click(screen.getByLabelText(/Surprise/));
    await userEvent.selectOptions(screen.getByLabelText(/^Method/), "cod");
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/surprise/);
    expect(socialOrdersApi.create).not.toHaveBeenCalled();
  });

  it("offers to place a duplicate after the customer confirms", async () => {
    vi.mocked(socialOrdersApi.create).mockRejectedValueOnce(new ApiError(409, "This buyer already has an order"));
    render(<AssistedOrderForm token="tok" />);
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));
    await userEvent.click(await screen.findByRole("button", { name: /place it anyway/ }));

    expect(vi.mocked(socialOrdersApi.create).mock.calls[1][0]).toMatchObject({ allow_duplicate: true });
  });
});
