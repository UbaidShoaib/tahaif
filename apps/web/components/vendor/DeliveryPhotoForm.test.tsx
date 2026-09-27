import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliveryPhotoForm } from "@/components/vendor/DeliveryPhotoForm";
import { ApiError } from "@/lib/api";
import { vendorApi, type VendorFulfillmentRead } from "@/lib/vendor";
import type * as VendorModule from "@/lib/vendor";

vi.mock("@/lib/vendor", async (importOriginal) => {
  const actual = await importOriginal<typeof VendorModule>();
  return { ...actual, vendorApi: { ...actual.vendorApi, confirmDeliveryWithPhoto: vi.fn() } };
});

function leg(overrides: Partial<VendorFulfillmentRead> = {}): VendorFulfillmentRead {
  return {
    id: "f-1",
    order_id: "o-1",
    public_token: "t-1",
    order_status: "dispatched",
    payment_method: "cod",
    status: "out_for_delivery",
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
    items: [],
    ...overrides,
  };
}

const photo = () => new File(["png"], "door.png", { type: "image/png" });

describe("DeliveryPhotoForm", () => {
  // Block body: a function returned from beforeEach runs as a cleanup hook,
  // and mockReset() returns the mock itself.
  beforeEach(() => {
    vi.mocked(vendorApi.confirmDeliveryWithPhoto).mockReset();
  });

  it("uploads the photo with who received it and reports the delivered leg", async () => {
    const user = userEvent.setup();
    const delivered = leg({ status: "delivered", delivery_photo_url: "https://s3/x.png", received_by: "Ammi" });
    vi.mocked(vendorApi.confirmDeliveryWithPhoto).mockResolvedValue(delivered);
    const onDone = vi.fn();
    render(<DeliveryPhotoForm fulfillment={leg()} token="tok" onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Deliver with photo" }));
    const file = photo();
    await user.upload(screen.getByLabelText(/Delivery photo/), file);
    await user.type(screen.getByLabelText(/Received by/), "Ammi");
    await user.click(screen.getByRole("button", { name: "Confirm delivery" }));

    expect(vendorApi.confirmDeliveryWithPhoto).toHaveBeenCalledWith("f-1", file, "Ammi", "tok");
    expect(onDone).toHaveBeenCalledWith(delivered);
    expect(screen.queryByRole("button", { name: "Confirm delivery" })).not.toBeInTheDocument();
  });

  it("asks for a photo before submitting", async () => {
    const user = userEvent.setup();
    render(<DeliveryPhotoForm fulfillment={leg()} token="tok" onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Deliver with photo" }));
    await user.click(screen.getByRole("button", { name: "Confirm delivery" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Take or choose a photo");
    expect(vendorApi.confirmDeliveryWithPhoto).not.toHaveBeenCalled();
  });

  it("rejects files that aren't photos", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<DeliveryPhotoForm fulfillment={leg()} token="tok" onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Deliver with photo" }));
    await user.upload(screen.getByLabelText(/Delivery photo/), new File(["%PDF"], "r.pdf", { type: "application/pdf" }));

    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP");
  });

  it("shows the API error and keeps the form open", async () => {
    const user = userEvent.setup();
    vi.mocked(vendorApi.confirmDeliveryWithPhoto).mockRejectedValue(
      new ApiError(503, "Photo storage is unavailable right now. Please try again shortly."),
    );
    render(<DeliveryPhotoForm fulfillment={leg()} token="tok" onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Deliver with photo" }));
    await user.upload(screen.getByLabelText(/Delivery photo/), photo());
    await user.click(screen.getByRole("button", { name: "Confirm delivery" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Photo storage is unavailable");
    expect(screen.getByRole("button", { name: "Confirm delivery" })).toBeEnabled();
  });

  it("offers to replace an existing photo on a delivered leg", () => {
    render(
      <DeliveryPhotoForm
        fulfillment={leg({ status: "delivered", delivery_photo_url: "https://s3/x.png" })}
        token="tok"
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Replace delivery photo" })).toBeInTheDocument();
  });
});
