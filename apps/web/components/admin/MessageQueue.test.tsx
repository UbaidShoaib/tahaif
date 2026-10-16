import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageQueue } from "@/components/admin/MessageQueue";
import { WhatsAppMessages } from "@/components/admin/WhatsAppMessages";
import { socialOrdersApi, type QueueEntry, type WhatsAppMessage } from "@/lib/social-orders";
import type * as SocialModule from "@/lib/social-orders";

vi.mock("@/lib/social-orders", async () => {
  const actual = await vi.importActual<typeof SocialModule>("@/lib/social-orders");
  return { ...actual, socialOrdersApi: { queue: vi.fn(), markSent: vi.fn(), messages: vi.fn() } };
});

const summary: WhatsAppMessage = {
  kind: "order_summary",
  label: "Send order summary",
  to: "buyer",
  phone: "+447700900123",
  text: "Assalam-o-Alaikum! Order #1A2B3C4D",
  url: "https://wa.me/447700900123?text=hi",
  due: true,
  sent_at: null,
};

const entry: QueueEntry = {
  order_id: "o1",
  order_ref: "1A2B3C4D",
  source: "instagram",
  buyer_phone: "+447700900123",
  placed_at: "2026-10-17T10:00:00Z",
  message: summary,
};

describe("MessageQueue", () => {
  beforeEach(() => {
    vi.mocked(socialOrdersApi.queue).mockReset();
    vi.mocked(socialOrdersApi.markSent).mockReset();
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("lists due messages with order, kind and source", async () => {
    vi.mocked(socialOrdersApi.queue).mockResolvedValue([entry]);
    render(<MessageQueue token="tok" />);
    expect(await screen.findByText(/Send order summary/)).toBeInTheDocument();
    expect(screen.getByText(/Instagram · to the buyer · \+447700900123/)).toBeInTheDocument();
  });

  it("opens WhatsApp, records the send and drops it from the list", async () => {
    vi.mocked(socialOrdersApi.queue).mockResolvedValue([entry]);
    vi.mocked(socialOrdersApi.markSent).mockResolvedValue({ ...summary, sent_at: "now", due: false });
    render(<MessageQueue token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: /Open WhatsApp/ }));

    expect(window.open).toHaveBeenCalledWith(summary.url, "_blank", "noopener,noreferrer");
    expect(socialOrdersApi.markSent).toHaveBeenCalledWith("o1", "order_summary", "tok");
    expect(await screen.findByText(/All caught up/)).toBeInTheDocument();
  });

  it("marks recipient messages as going to the recipient", async () => {
    vi.mocked(socialOrdersApi.queue).mockResolvedValue([
      {
        ...entry,
        buyer_phone: "+923001234567",
        message: { ...summary, kind: "recipient_on_the_way", label: "Recipient: on its way", to: "recipient", phone: "+923001234567" },
      },
    ]);
    render(<MessageQueue token="tok" />);
    expect(await screen.findByText(/to the recipient · \+923001234567/)).toBeInTheDocument();
  });

  it("says when there is nothing to send", async () => {
    vi.mocked(socialOrdersApi.queue).mockResolvedValue([]);
    render(<MessageQueue token="tok" />);
    expect(await screen.findByText(/All caught up/)).toBeInTheDocument();
  });
});

describe("WhatsAppMessages", () => {
  beforeEach(() => {
    vi.mocked(socialOrdersApi.markSent).mockReset();
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("marks a message sent after opening it", async () => {
    vi.mocked(socialOrdersApi.markSent).mockResolvedValue({ ...summary, sent_at: "2026-10-17T11:00:00Z", due: false });
    render(<WhatsAppMessages orderId="o1" token="tok" initial={[summary]} />);

    await userEvent.click(screen.getByRole("button", { name: /Send order summary.*due now/ }));
    expect(await screen.findByRole("button", { name: /Send order summary.*sent/ })).toBeInTheDocument();
  });

  it("explains when the order has no buyer phone", () => {
    render(<WhatsAppMessages orderId="o1" token="tok" initial={[]} />);
    expect(screen.getByText(/No buyer phone/)).toBeInTheDocument();
  });
});
