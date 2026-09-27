import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "@/lib/api";

type RequestInitLike = RequestInit & { headers: Record<string, string> };

function mockResponse(body: unknown, init: { ok: boolean; status: number; statusText?: string } = { ok: true, status: 200 }) {
  return {
    ...init,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("apiFetch", () => {
  const originalFetch = global.fetch;
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = vi.fn<typeof fetch>();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends a GET by default with JSON content-type", async () => {
    fetchSpy.mockResolvedValue(mockResponse({ hello: "world" }));

    const result = await apiFetch<{ hello: string }>("/ping");

    expect(result).toEqual({ hello: "world" });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInitLike];
    expect(url).toContain("/ping");
    expect(init.method).toBe("GET");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBeUndefined();
  });

  it("attaches a bearer token and idempotency key when provided", async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await apiFetch("/checkout/place", {
      method: "POST",
      token: "abc123",
      idempotencyKey: "key-1",
      body: { foo: "bar" },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInitLike];
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer abc123");
    expect(init.headers["Idempotency-Key"]).toBe("key-1");
    expect(init.body).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("sends FormData as-is so the browser sets the multipart boundary", async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));
    const form = new FormData();
    form.append("received_by", "Ammi");

    await apiFetch("/vendor/fulfillments/f-1/delivery-photo", { method: "POST", body: form, token: "t" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInitLike];
    expect(init.body).toBe(form);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.headers["Authorization"]).toBe("Bearer t");
  });

  it("returns undefined for a 204 No Content response", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("should not be called")),
    } as Response);

    const result = await apiFetch("/cart/items/123");
    expect(result).toBeUndefined();
  });

  it("throws ApiError with the server-provided detail on failure", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({ detail: "Duplicate order" }, { ok: false, status: 409, statusText: "Conflict" }),
    );

    await expect(apiFetch("/checkout/place", { method: "POST" })).rejects.toMatchObject({
      status: 409,
      detail: "Duplicate order",
    });
  });

  it("falls back to statusText when the error body isn't valid JSON", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    } as Response);

    try {
      await apiFetch("/broken");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).detail).toBe("Internal Server Error");
    }
  });
});
