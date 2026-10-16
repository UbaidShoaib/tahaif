import { describe, it, expect, beforeEach } from "vitest";
import { currentCampaign, orderMessage } from "@/lib/order-on-whatsapp";

describe("orderMessage", () => {
  it("lists product, option, price, city, card message, link and campaign", () => {
    const text = orderMessage({
      productName: "Chocolate Cake",
      variantName: "2 lb",
      pricePkr: 350000,
      cityName: "Lahore",
      greeting: "  Happy birthday Ammi  ",
      productUrl: "https://bouquetbar.pk/p/chocolate-cake",
      campaign: "eid-reel",
    });
    expect(text).toContain("• Chocolate Cake (2 lb) — ");
    expect(text).toMatch(/3,500/);
    expect(text).toContain("Deliver in: Lahore");
    expect(text).toContain('Card message: "Happy birthday Ammi"');
    expect(text).toContain("https://bouquetbar.pk/p/chocolate-cake");
    expect(text.endsWith("(ref: eid-reel)")).toBe(true);
  });

  it("leaves out what the buyer hasn't chosen", () => {
    const text = orderMessage({ productName: "Roses", pricePkr: 250000, greeting: " ", productUrl: "u" });
    expect(text).not.toMatch(/Deliver in|Card message|ref:|\(/);
  });
});

describe("currentCampaign", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("reads utm_campaign and remembers it for the visit", () => {
    expect(currentCampaign("?utm_source=instagram&utm_campaign=eid-reel")).toBe("eid-reel");
    expect(currentCampaign("")).toBe("eid-reel");
  });

  it("is null when the visitor didn't come from a campaign", () => {
    expect(currentCampaign("?q=cake")).toBeNull();
  });
});
