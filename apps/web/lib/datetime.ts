/**
 * Times for buyers who aren't in the city they send to (diaspora).
 *
 * Delivery happens in the city's time zone (Asia/Karachi for every city today),
 * so that's always shown first; the buyer's own time is added when it differs.
 * The viewer's zone is only known in the browser, so callers pass it in (see
 * components/time/DualTime.tsx for the hydration-safe wrapper).
 */

export const PAKISTAN_TZ = "Asia/Karachi";

/** The browser's IANA time zone, or null when it can't be resolved. */
export function viewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Short label for a city's zone: "PKT" for Pakistan, else e.g. "GMT+4". */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  if (timeZone === PAKISTAN_TZ) return "PKT";
  const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** Offset of a zone from UTC in minutes at a given instant. */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** True when both zones show the same wall-clock time at that instant. */
export function sameClock(a: string, b: string, at: Date = new Date()): boolean {
  return offsetMinutes(a, at) === offsetMinutes(b, at);
}

/** "2:30 pm" in a zone. */
export function formatClock(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(at)
    .replace(/\s?([ap])\.?m\.?$/i, " $1m")
    .toLowerCase();
}

/** "28 Sep, 2:30 pm" in a zone. */
export function formatDateTime(at: Date, timeZone: string): string {
  // From parts with en-US month names: en-GB's short month is "Sep" or "Sept"
  // depending on the ICU version.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric", month: "short" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")}, ${formatClock(at, timeZone)}`;
}

/**
 * The buyer's-time suffix for an instant, e.g. "10:30 am your time", or
 * "9:30 pm Sat your time" when the buyer's calendar day differs. Null when
 * there's nothing to add (same clock, or zone unknown).
 */
export function viewerSuffix(at: Date, cityTz: string, viewerTz: string | null): string | null {
  if (!viewerTz || sameClock(cityTz, viewerTz, at)) return null;
  const dayOf = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short" }).format(at);
  const weekday =
    dayOf(cityTz) === dayOf(viewerTz)
      ? ""
      : ` ${new Intl.DateTimeFormat("en-GB", { timeZone: viewerTz, weekday: "short" }).format(at)}`;
  return `${formatClock(at, viewerTz)}${weekday} your time`;
}

/**
 * The instant a naive city time ("14:00[:00]") happens on a city date.
 * Cutoffs and slots are stored as naive TIME and applied in the city's zone.
 */
export function cityTimeToInstant(isoDate: string, time: string, cityTz: string): Date {
  const [h = "0", m = "0"] = time.split(":");
  const guess = new Date(`${isoDate}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00Z`);
  return new Date(guess.getTime() - offsetMinutes(cityTz, guess) * 60_000);
}

/**
 * Format a date-only value ("2026-09-28") without shifting it through the
 * viewer's zone. `new Date("2026-09-28")` is UTC midnight, which is the
 * previous evening in the Americas, so a plain toLocaleDateString shows the
 * wrong day there.
 */
export function formatCalendarDate(isoDate: string, options: Intl.DateTimeFormatOptions, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}
