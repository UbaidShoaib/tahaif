import { describe, it, expect, vi, afterEach } from "vitest";
import { onTimePercent } from "@/lib/stats";

const respond = (body: unknown, ok = true) =>
  vi.fn<typeof fetch>().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Server Error",
    json: () => Promise.resolve(body),
  } as Response);

describe("onTimePercent", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the vendor's measured rate", async () => {
    global.fetch = respond({ on_time_percent: 97, delivered_count: 40, window_days: 90, min_sample: 20 });
    expect(await onTimePercent("v-1")).toBe(97);
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toContain("/stats/on-time?vendor_id=v-1");
  });

  it("hides the signal when the API fails", async () => {
    global.fetch = respond({ detail: "boom" }, false);
    expect(await onTimePercent()).toBeNull();
  });
});
