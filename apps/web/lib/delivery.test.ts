import { describe, it, expect } from "vitest";
import { earliestDelivery, formatCountdown, formatDeliveryDay, zonedNow } from "@/lib/delivery";
import type { ProductCity } from "@/lib/catalog";

const TZ = "Asia/Karachi"; // UTC+5, no DST
const pc = (o: Partial<ProductCity> = {}): ProductCity => ({
  city_id: "lhr", price_override_pkr: null, delivery_fee_pkr: 25_000, lead_time_hours: 24,
  same_day_cutoff: null, is_available: true, ...o,
});
// 2026-09-26 10:00 in Karachi
const MORNING = new Date("2026-09-26T05:00:00Z");
// 2026-09-26 20:00 in Karachi
const EVENING = new Date("2026-09-26T15:00:00Z");

describe("zonedNow", () => {
  it("reads wall-clock time in the city", () => {
    expect(zonedNow(TZ, MORNING)).toEqual({ date: "2026-09-26", minutes: 600 });
    // 22:00 UTC is already the next day in Karachi
    expect(zonedNow(TZ, new Date("2026-09-26T22:00:00Z")).date).toBe("2026-09-27");
  });
});

describe("earliestDelivery", () => {
  it("offers same-day before the cutoff, with minutes remaining", () => {
    expect(earliestDelivery(pc({ same_day_cutoff: "14:00:00" }), TZ, MORNING)).toEqual({
      date: "2026-09-26", sameDay: true, minutesToCutoff: 240,
    });
  });

  it("falls back to the lead time after the cutoff", () => {
    expect(earliestDelivery(pc({ same_day_cutoff: "14:00", lead_time_hours: 4 }), TZ, EVENING)).toEqual({
      date: "2026-09-27", sameDay: false, minutesToCutoff: null,
    });
  });

  it("never promises today without a same-day cutoff", () => {
    expect(earliestDelivery(pc({ lead_time_hours: 2 }), TZ, MORNING).date).toBe("2026-09-27");
  });

  it("respects long lead times", () => {
    expect(earliestDelivery(pc({ lead_time_hours: 72 }), TZ, MORNING).date).toBe("2026-09-29");
  });
});

describe("formatting", () => {
  it("names today and tomorrow, and dates beyond that", () => {
    expect(formatDeliveryDay("2026-09-26", TZ, MORNING)).toBe("Today");
    expect(formatDeliveryDay("2026-09-27", TZ, MORNING)).toBe("Tomorrow");
    expect(formatDeliveryDay("2026-09-29", TZ, MORNING)).toMatch(/^Tue, 29 Sept?$/);
  });

  it("formats a countdown", () => {
    expect(formatCountdown(192)).toBe("3h 12m");
    expect(formatCountdown(45)).toBe("45m");
  });
});
