import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupportWhatsApp } from "@/components/support/SupportWhatsApp";
import { viewerTimeZone } from "@/lib/datetime";
import type * as DateTimeModule from "@/lib/datetime";

vi.mock("@/lib/datetime", async (importOriginal) => ({
  ...(await importOriginal<typeof DateTimeModule>()),
  viewerTimeZone: vi.fn(),
}));

const config = { whatsapp: "923001234567", hours: { open: "09:00", close: "21:00" } };

describe("SupportWhatsApp", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T06:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("links to WhatsApp with the pre-filled message and shows the buyer's hours", async () => {
    vi.mocked(viewerTimeZone).mockReturnValue("Europe/London");
    render(<SupportWhatsApp config={config} message="Order ABC123" />);

    expect(screen.getByRole("link", { name: "Chat with us on WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/923001234567?text=Order%20ABC123",
    );
    expect(await screen.findByText(/9:00 am–9:00 pm PKT \(5:00 am–5:00 pm your time\)/)).toBeInTheDocument();
  });

  it("shows only Pakistan hours to a buyer in Pakistan", () => {
    vi.mocked(viewerTimeZone).mockReturnValue("Asia/Karachi");
    render(<SupportWhatsApp config={config} />);

    expect(screen.getByText("A real person replies 9:00 am–9:00 pm PKT")).toBeInTheDocument();
  });

  it("renders nothing without a configured number", () => {
    const { container } = render(<SupportWhatsApp config={{ ...config, whatsapp: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
