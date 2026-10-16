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

const SHORT_DATE: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

/** "Mon 19 Oct" for a calendar date (YYYY-MM-DD), with no timezone shift. */
function shortCalendarDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { ...SHORT_DATE, timeZone: "UTC" }).replace(",", "");
}

/** "Sat 17 Oct" for an instant, on the delivery city's calendar (Pakistan by default). */
function shortInstantDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { ...SHORT_DATE, timeZone }).replace(",", "");
}

/**
 * One line of status for an order in a list, in words: when it arrives, or
 * what happened. `deliveryDate` is the (first) fulfilment's date; `deliveredAt`
 * is set once delivered.
 */
export function orderRowStatus(
  status: string,
  deliveryDate: string | null,
  deliveredAt: string | null,
  cityTimeZone = "Asia/Karachi",
): string {
  switch (status) {
    case "delivered":
    case "completed":
      return deliveredAt ? `Delivered ${shortInstantDate(deliveredAt, cityTimeZone)}` : "Delivered";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    case "on_hold":
      return "On hold — we'll be in touch";
    case "pending_payment":
      return "Awaiting payment";
    case "out_for_delivery":
      return "Out for delivery today";
    default:
      return deliveryDate ? `Arriving ${shortCalendarDate(deliveryDate)}` : "In progress";
  }
}
