/** Short, readable order number from the public token (as shown in emails and tracking). */
export function orderNumber(publicToken: string): string {
  return publicToken.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Statuses after which an order no longer changes on its own, so pages stop polling. */
const SETTLED_STATUSES = new Set(["delivered", "completed", "cancelled", "refunded"]);

export function isOrderLive(status: string): boolean {
  return !SETTLED_STATUSES.has(status);
}

/**
 * The one-sentence answer at the top of the tracking page: where the gift is,
 * addressed to the person it's for rather than as a status code.
 */
export function statusHeadline(status: string, recipient: string | null, vendor: string | null): string {
  const forWhom = recipient ? ` for ${recipient}` : "";
  switch (status) {
    case "pending_payment":
      return `We've got your order${forWhom}`;
    case "paid":
      return `Your gift${forWhom} is confirmed`;
    case "preparing":
      return vendor ? `${vendor} is preparing your gift${forWhom}` : `Your gift${forWhom} is being prepared`;
    case "dispatched":
      return `Your gift${forWhom} is on its way`;
    case "out_for_delivery":
      return recipient ? `Out for delivery to ${recipient}` : "Your gift is out for delivery";
    case "delivered":
    case "completed":
      return recipient ? `Delivered to ${recipient}` : "Your gift was delivered";
    case "cancelled":
      return "This order was cancelled";
    case "refunded":
      return "This order was refunded";
    case "on_hold":
      return "Your order is on hold";
    default:
      return "Track your order";
  }
}
