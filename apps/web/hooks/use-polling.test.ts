import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "./use-polling";
import { isOrderLive } from "@/lib/orders";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => vi.useRealTimers());

  it("polls on the interval while active", () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, true, 1000));
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does nothing when inactive", () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, false, 1000));
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("pauses while the tab is hidden and refreshes on return", () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, true, 1000));
    setVisibility("hidden");
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after unmount", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => usePolling(fn, true, 1000));
    unmount();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("isOrderLive", () => {
  it("is false only for settled orders", () => {
    expect(isOrderLive("pending_payment")).toBe(true);
    expect(isOrderLive("out_for_delivery")).toBe(true);
    for (const s of ["delivered", "completed", "cancelled", "refunded"]) expect(isOrderLive(s)).toBe(false);
  });
});
