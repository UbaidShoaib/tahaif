import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cartApi } from "@/lib/cart";
import { getGuestCartToken, setGuestCartToken, syncGuestCartToken } from "@/lib/guest-cart";

const emptyCart = { id: null, item_count: 0, subtotal_pkr: 0, items: [] };

function mockFetch(body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sentHeaders = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers;

describe("guest cart token", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("stores the token a guest cart returns and forgets it once merged into an account", () => {
    syncGuestCartToken({ guest_token: "g1" }, false);
    expect(getGuestCartToken()).toBe("g1");
    syncGuestCartToken({ guest_token: null }, false); // guest with no cart yet: keep it
    expect(getGuestCartToken()).toBe("g1");
    syncGuestCartToken({ guest_token: null }, true); // signed-in cart: merged
    expect(getGuestCartToken()).toBeNull();
  });

  it("guest adds send no Authorization and save the issued token", async () => {
    const fetchFn = mockFetch({ ...emptyCart, item_count: 1, guest_token: "issued" });
    await cartApi.addItem({ product_id: "p1", qty: 1 }, null);
    expect(sentHeaders(fetchFn).Authorization).toBeUndefined();
    expect(sentHeaders(fetchFn)["X-Cart-Token"]).toBeUndefined();
    expect(getGuestCartToken()).toBe("issued");
  });

  it("sends both credentials after sign-in so the API can merge, then drops the token", async () => {
    setGuestCartToken("g1");
    const fetchFn = mockFetch(emptyCart);
    await cartApi.get("access");
    expect(sentHeaders(fetchFn)).toMatchObject({ Authorization: "Bearer access", "X-Cart-Token": "g1" });
    expect(getGuestCartToken()).toBeNull();
  });

  it("sends the guest token with checkout calls", async () => {
    setGuestCartToken("g1");
    const fetchFn = mockFetch({});
    await cartApi.quote("lhr", null);
    await cartApi.place({} as never, null, "idem-1");
    for (const call of fetchFn.mock.calls) {
      expect((call[1] as { headers: Record<string, string> }).headers["X-Cart-Token"]).toBe("g1");
    }
    expect((fetchFn.mock.calls[1]?.[1] as { headers: Record<string, string> }).headers["Idempotency-Key"]).toBe("idem-1");
  });
});
