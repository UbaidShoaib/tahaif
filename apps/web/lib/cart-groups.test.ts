import { describe, it, expect } from "vitest";
import { groupByRecipient } from "@/lib/cart-groups";
import type { CartItemRead } from "@/lib/cart";

const line = (id: string, recipient: string | null, date: string | null): CartItemRead => ({
  id, product_id: id, product_name: id, product_slug: id, product_image: null, variant_id: null, variant_name: null,
  qty: 1, unit_price_pkr: 100, line_total_pkr: 100, delivery_date: date, greeting_message: null,
  recipient_name: recipient, recipient_phone: null,
});

describe("groupByRecipient", () => {
  it("groups lines by recipient and day, in the order they were added", () => {
    const groups = groupByRecipient([
      line("cake", "Ammi", "2026-10-27"),
      line("roses", null, "2026-10-27"),
      line("mithai", "Abbu", "2026-10-28"),
      line("card", " ammi ", "2026-10-27"),
      line("perfume", null, "2026-10-27"),
    ]);
    expect(groups.map((g) => [g.recipientName, g.deliveryDate, g.items.map((i) => i.id)])).toEqual([
      ["Ammi", "2026-10-27", ["cake", "card"]],
      [null, "2026-10-27", ["roses", "perfume"]],
      ["Abbu", "2026-10-28", ["mithai"]],
    ]);
  });

  it("keeps undated, unnamed lines together", () => {
    expect(groupByRecipient([line("a", null, null), line("b", null, null)])).toHaveLength(1);
  });
});
