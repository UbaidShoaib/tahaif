import { describe, it, expect } from "vitest";
import {
  cityTimeToInstant,
  formatCalendarDate,
  formatClock,
  formatDateTime,
  sameClock,
  viewerSuffix,
  zoneLabel,
} from "@/lib/datetime";

const PK = "Asia/Karachi";
// 14:30 in Pakistan (UTC+5) on 28 Sep 2026.
const AT = new Date("2026-09-28T09:30:00Z");

describe("datetime", () => {
  it("formats a clock and a date-time in a zone", () => {
    expect(formatClock(AT, PK)).toBe("2:30 pm");
    expect(formatDateTime(AT, PK)).toBe("28 Sep, 2:30 pm");
    expect(formatClock(AT, "Europe/London")).toBe("10:30 am");
  });

  it("labels Pakistan as PKT and other zones by their short name", () => {
    expect(zoneLabel(PK)).toBe("PKT");
    // ICU names some zones ("GST") and falls back to offsets for others.
    expect(zoneLabel("Asia/Dubai", AT)).toMatch(/^(GST|GMT\+4)$/);
  });

  it("knows when two zones show the same clock", () => {
    expect(sameClock(PK, "Asia/Tashkent", AT)).toBe(true);
    expect(sameClock(PK, "Europe/London", AT)).toBe(false);
  });

  it("adds the buyer's time only when it differs", () => {
    expect(viewerSuffix(AT, PK, "Europe/London")).toBe("10:30 am your time");
    expect(viewerSuffix(AT, PK, PK)).toBeNull();
    expect(viewerSuffix(AT, PK, null)).toBeNull();
  });

  it("names the buyer's weekday when their calendar day differs", () => {
    // 01:00 Mon in Pakistan is still Sunday evening in Toronto.
    const early = new Date("2026-09-27T20:00:00Z");
    expect(viewerSuffix(early, PK, "America/Toronto")).toBe("4:00 pm Sun your time");
  });

  it("turns a naive city time into the right instant", () => {
    expect(cityTimeToInstant("2026-09-28", "14:00:00", PK).toISOString()).toBe("2026-09-28T09:00:00.000Z");
    // Across a DST boundary the offset of that date is used (London is UTC+0 in December).
    expect(cityTimeToInstant("2026-12-01", "09:15", "Europe/London").toISOString()).toBe("2026-12-01T09:15:00.000Z");
  });

  it("formats a date-only value on its own calendar day in any zone", () => {
    expect(formatCalendarDate("2026-09-28", { weekday: "long", day: "numeric", month: "long" }, "en-US")).toBe(
      "Monday, September 28",
    );
  });
});
