/** Short, readable order number from the public token (as shown in emails and tracking). */
export function orderNumber(publicToken: string): string {
  return publicToken.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Statuses after which an order no longer changes on its own, so pages stop polling. */
const SETTLED_STATUSES = new Set(["delivered", "completed", "cancelled", "refunded"]);

export function isOrderLive(status: string): boolean {
  return !SETTLED_STATUSES.has(status);
}
