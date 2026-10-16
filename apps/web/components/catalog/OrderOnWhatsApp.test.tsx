import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderOnWhatsApp } from "@/components/catalog/OrderOnWhatsApp";
import { captureEvent } from "@/components/providers";

vi.mock("@/components/providers", () => ({ captureEvent: vi.fn() }));

const props = {
  productId: "p1",
  productPath: "/p/chocolate-cake",
  productName: "Chocolate Cake",
  variantName: "2 lb",
  pricePkr: 350000,
  cityName: "Lahore",
  greeting: "",
};

describe("OrderOnWhatsApp", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.mocked(captureEvent).mockReset();
  });

  it("renders nothing without a business number", () => {
    const { container } = render(<OrderOnWhatsApp {...props} whatsapp={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens our chat with the order filled in and records the click", async () => {
    window.sessionStorage.setItem("utm_campaign", "eid-reel");
    render(<OrderOnWhatsApp {...props} whatsapp="923001234567" />);

    await userEvent.click(screen.getByRole("button", { name: /Order on WhatsApp/ }));

    const url = vi.mocked(window.open).mock.calls[0][0] as string;
    expect(url.startsWith("https://wa.me/923001234567?text=")).toBe(true);
    const text = decodeURIComponent(url.split("text=")[1]);
    expect(text).toContain("Chocolate Cake (2 lb)");
    expect(text).toContain("Deliver in: Lahore");
    expect(text).toContain(`${window.location.origin}/p/chocolate-cake`);
    expect(text).toContain("(ref: eid-reel)");
    expect(captureEvent).toHaveBeenCalledWith("order_on_whatsapp", { product_id: "p1", campaign: "eid-reel" });
  });
});
