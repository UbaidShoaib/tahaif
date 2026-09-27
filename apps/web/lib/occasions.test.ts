import { describe, it, expect } from "vitest";
import { daysUntil, formatDaysUntil, formatMonthDay } from "@/lib/occasions";

describe("occasions", () => {
  it("counts days to the next occurrence, rolling into next year", () => {
    expect(daysUntil({ month: 10, day: 3 }, "2026-09-28")).toBe(5);
    expect(daysUntil({ month: 9, day: 28 }, "2026-09-28")).toBe(0);
    expect(daysUntil({ month: 9, day: 27 }, "2026-09-28")).toBe(364);
    expect(daysUntil({ month: 1, day: 1 }, "2026-12-31")).toBe(1);
  });

  it("marks a 29 Feb birthday on 28 Feb in non-leap years", () => {
    expect(daysUntil({ month: 2, day: 29 }, "2027-02-27")).toBe(1);
    expect(daysUntil({ month: 2, day: 29 }, "2028-02-27")).toBe(2);
  });

  it("formats dates and countdowns", () => {
    expect(formatMonthDay({ month: 3, day: 12 })).toBe("12 Mar");
    expect(formatDaysUntil(0)).toBe("today");
    expect(formatDaysUntil(1)).toBe("tomorrow");
    expect(formatDaysUntil(5)).toBe("in 5 days");
  });
});
