import { describe, it, expect } from "vitest";
import { isOrderLive, orderRowStatus, statusHeadline } from "@/lib/orders";

describe("statusHeadline", () => {
  it("speaks to the buyer about the recipient", () => {
    expect(statusHeadline("preparing", "Ammi", "Layers Bakeshop")).toBe("Layers Bakeshop is preparing your gift for Ammi");
    expect(statusHeadline("dispatched", "Ammi", null)).toBe("Your gift for Ammi is on its way");
    expect(statusHeadline("out_for_delivery", "Ammi", null)).toBe("Out for delivery to Ammi");
    expect(statusHeadline("completed", "Ammi", null)).toBe("Delivered to Ammi");
  });

  it("reads naturally without a recipient or vendor", () => {
    expect(statusHeadline("preparing", null, null)).toBe("Your gift is being prepared");
    expect(statusHeadline("delivered", null, null)).toBe("Your gift was delivered");
    expect(statusHeadline("something_new", "Ammi", null)).toBe("Track your order");
  });

  it("is plain about exceptions", () => {
    expect(statusHeadline("cancelled", "Ammi", null)).toBe("This order was cancelled");
    expect(statusHeadline("on_hold", "Ammi", null)).toBe("Your order is on hold");
  });
});

describe("isOrderLive", () => {
  it("stops once the order settles", () => {
    expect(isOrderLive("preparing")).toBe(true);
    expect(isOrderLive("delivered")).toBe(false);
  });
});

describe("orderRowStatus", () => {
  it("says when a live order arrives", () => {
    expect(orderRowStatus("preparing", "2026-10-19", null)).toBe("Arriving Mon 19 Oct");
    expect(orderRowStatus("out_for_delivery", "2026-10-19", null)).toBe("Out for delivery today");
    expect(orderRowStatus("paid", null, null)).toBe("In progress");
  });

  it("says what happened to a settled order", () => {
    expect(orderRowStatus("delivered", "2026-10-17", "2026-10-17T10:00:00Z")).toBe("Delivered Sat 17 Oct");
    expect(orderRowStatus("completed", null, null)).toBe("Delivered");
    // 20:55 UTC on the 16th is already the 17th in Lahore
    expect(orderRowStatus("delivered", null, "2026-10-16T20:55:00Z")).toBe("Delivered Sat 17 Oct");
    expect(orderRowStatus("cancelled", "2026-10-19", null)).toBe("Cancelled");
  });
});
