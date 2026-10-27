import { describe, expect, it } from "vitest";
import { couponSummary, dayToInstant, instantToDay, optionalWhole } from "@/lib/back-office-admin";
import { rateFromRupees, rupeesPerUnit } from "@/components/admin/FxRates";

describe("Pakistan days", () => {
  it("turns a day into its start or last minute in Pakistan time, and back", () => {
    expect(dayToInstant("2030-03-01")).toBe("2030-02-28T19:00:00.000Z");
    expect(dayToInstant("2030-03-01", true)).toBe("2030-03-01T18:59:00.000Z");
    expect(instantToDay("2030-03-01T18:59:00.000Z")).toBe("2030-03-01");
    expect(dayToInstant("")).toBeNull();
    expect(instantToDay(null)).toBe("");
  });
});

describe("optionalWhole", () => {
  it("is null when blank, the number when whole and big enough, else undefined", () => {
    expect(optionalWhole(" ")).toBeNull();
    expect(optionalWhole("5", 1)).toBe(5);
    expect(optionalWhole("0", 1)).toBeUndefined();
    expect(optionalWhole("2.5")).toBeUndefined();
  });
});

describe("couponSummary", () => {
  it("says what the coupon takes off", () => {
    expect(couponSummary({ coupon_type: "percent", value: "10.00" })).toBe("10% off");
    expect(couponSummary({ coupon_type: "fixed", value: "1500.00" })).toBe("Rs 1,500 off");
    expect(couponSummary({ coupon_type: "free_shipping", value: "1.00" })).toBe("Free delivery");
  });
});

describe("exchange rates", () => {
  it("shows and reads rates as rupees per unit", () => {
    expect(rupeesPerUnit("0.002500")).toBe("Rs 400.00");
    expect(rupeesPerUnit(null)).toBe("—");
    expect(rateFromRupees("400")).toBe("0.002500");
    expect(rateFromRupees("0")).toBeNull();
    expect(rateFromRupees("abc")).toBeNull();
  });
});
