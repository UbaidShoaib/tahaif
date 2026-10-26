import { describe, it, expect } from "vitest";
import { attentionRows } from "@/components/admin/AttentionInbox";
import type { OrderSummary } from "@/components/admin/OrderList";
import type { QueueEntry } from "@/lib/social-orders";

const o = (id: string, extra: Partial<OrderSummary>): OrderSummary => ({
  id, public_token: `${id}-token`, status: "paid", next_statuses: [], user_id: null, total_pkr: 650_000, currency: "PKR",
  placed_at: "2026-10-25T10:00:00Z", payment_method: "cod", payment_status: null, proof_url: null, source: "web",
  buyer_name: "Sara", buyer_phone: null, recipients: ["Ammi (Lahore)"], delivery_date: "2026-10-27", customer_confirmed_at: null,
  ...extra,
});

describe("attentionRows", () => {
  it("lists receipts to verify, messages to send and late orders, in that order", () => {
    const rows = attentionRows(
      [
        o("r1", { status: "pending_payment", payment_method: "bank_transfer", proof_url: "https://s3/receipt" }),
        o("r2", { status: "pending_payment", payment_method: "bank_transfer" }), // no receipt yet
      ],
      [
        o("late", { delivery_date: "2026-10-25", status: "preparing" }),
        o("today", { delivery_date: "2026-10-26", status: "paid" }),
        o("started", { delivery_date: "2026-10-26", status: "preparing" }),
        o("future", { delivery_date: "2026-10-28" }),
      ],
      [{ order_id: "ig", order_ref: "IG-0412", message: { kind: "confirm", label: "Confirmation" } } as unknown as QueueEntry],
      "2026-10-26",
    );
    expect(rows.map((r) => r.key)).toEqual(["r-r1", "w-ig-confirm", "l-late", "l-today"]);
  });
});
