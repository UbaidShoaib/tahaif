import type { CartItemRead } from "@/lib/cart";

export type RecipientGroup = {
  key: string;
  /** Who it's for; null until the buyer names them at checkout. */
  recipientName: string | null;
  /** YYYY-MM-DD chosen on the product page; null when not chosen yet. */
  deliveryDate: string | null;
  items: CartItemRead[];
};

/**
 * Cart lines grouped the way they ship: one group per recipient and delivery
 * day (Buyer ≠ Recipient, CLAUDE.md). Groups keep the order their first item
 * was added; lines with no recipient or day yet share a group per day.
 */
export function groupByRecipient(items: CartItemRead[]): RecipientGroup[] {
  const groups = new Map<string, RecipientGroup>();
  for (const item of items) {
    const name = item.recipient_name?.trim() || null;
    const key = `${name?.toLowerCase() ?? ""}|${item.delivery_date ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, recipientName: name, deliveryDate: item.delivery_date, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
