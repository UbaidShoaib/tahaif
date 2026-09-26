import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("API error messages", () => {
  it("keeps string details", () => {
    expect(errorMessage("Invalid credentials")).toBe("Invalid credentials");
  });

  it("turns FastAPI validation lists into a readable sentence", () => {
    expect(
      errorMessage([
        { loc: ["body", "email"], msg: "value is not a valid email address: The part after the @-sign is reserved." },
        { loc: ["body", "password"], msg: "Value error, Password is too short" },
      ]),
    ).toBe("value is not a valid email address: The part after the @-sign is reserved. Password is too short");
  });

  it("never throws an ApiError whose message is an object (it crashed the login page)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: () => Promise.resolve({ detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }] }),
      }),
    );
    const err = await apiFetch("/auth/login", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).detail).toBe("value is not a valid email address");
    expect(typeof (err as ApiError).message).toBe("string");
  });

  it("falls back to the status text for unknown shapes", () => {
    expect(errorMessage({ weird: true })).toBeUndefined();
  });
});
