import type { ProductCity } from "@/lib/catalog";

/**
 * Delivery times a buyer can pick. The label is what's stored on the order, so
 * these must match DeliverySlot in apps/api/app/schemas/order.py.
 * Midnight arrives just before midnight at the end of the chosen date.
 */
export const DELIVERY_SLOTS = [
  "Midnight (11pm–12am)",
  "Morning (10am–1pm)",
  "Afternoon (2pm–5pm)",
  "Evening (6pm–9pm)",
] as const;

export type DeliverySlot = (typeof DELIVERY_SLOTS)[number];

/** Wall-clock date (YYYY-MM-DD) and minutes-since-midnight in a time zone. */
export function zonedNow(timeZone: string, now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM[:SS]" → minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export type EarliestDelivery = {
  /** YYYY-MM-DD in the city's time zone. */
  date: string;
  sameDay: boolean;
  /** Minutes left to order for same-day delivery; null when same-day isn't possible now. */
  minutesToCutoff: number | null;
};

/**
 * Earliest delivery date for a product in a city.
 *
 * - Same-day is only offered when the product declares a `same_day_cutoff`
 *   and it's still before that time in the city (slots/cutoffs are naive times
 *   applied in the city's time zone — CLAUDE.md "Time").
 * - Otherwise the gift is ready `lead_time_hours` from now, and never earlier
 *   than tomorrow.
 */
export function earliestDelivery(pc: ProductCity, timeZone: string, now: Date = new Date()): EarliestDelivery {
  const local = zonedNow(timeZone, now);
  if (pc.same_day_cutoff) {
    const cutoff = timeToMinutes(pc.same_day_cutoff);
    if (local.minutes < cutoff) {
      return { date: local.date, sameDay: true, minutesToCutoff: cutoff - local.minutes };
    }
  }
  const ready = zonedNow(timeZone, new Date(now.getTime() + pc.lead_time_hours * 3_600_000)).date;
  const tomorrow = addDays(local.date, 1);
  return { date: ready > tomorrow ? ready : tomorrow, sameDay: false, minutesToCutoff: null };
}

/** "Today", "Tomorrow" or e.g. "Mon, 29 Sep", relative to today in the same zone. */
export function formatDeliveryDay(isoDate: string, timeZone: string, now: Date = new Date()): string {
  const today = zonedNow(timeZone, now).date;
  if (isoDate === today) return "Today";
  if (isoDate === addDays(today, 1)) return "Tomorrow";
  // Assembled from parts: ICU versions disagree on the punctuation of the combined format.
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .formatToParts(new Date(`${isoDate}T00:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")}`;
}

/** 192 → "3h 12m"; 45 → "45m". */
export function formatCountdown(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
