import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCurrencyStore } from "@/stores/currency.store";
import { useAuthStore } from "@/stores/auth.store";
import { accountApi } from "@/lib/account";
import type * as AccountModule from "@/lib/account";

vi.mock("@/lib/account", async (importOriginal) => {
  const actual = await importOriginal<typeof AccountModule>();
  return { ...actual, accountApi: { ...actual.accountApi, fxRates: vi.fn(), updateMe: vi.fn() } };
});

const rates = { PKR: "1", GBP: "0.002800" };

describe("currency store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(accountApi.fxRates).mockReset();
    vi.mocked(accountApi.updateMe).mockReset();
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1" } });
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
  });

  it("restores a remembered currency when a rate exists", async () => {
    window.localStorage.setItem("tahaif_currency", "GBP");
    vi.mocked(accountApi.fxRates).mockResolvedValue({ base: "PKR", rates });
    await useCurrencyStore.getState().loadRates();
    expect(useCurrencyStore.getState().currency).toBe("GBP");
  });

  it("falls back to PKR when the remembered currency has no rate", async () => {
    window.localStorage.setItem("tahaif_currency", "USD");
    vi.mocked(accountApi.fxRates).mockResolvedValue({ base: "PKR", rates });
    await useCurrencyStore.getState().loadRates();
    expect(useCurrencyStore.getState().currency).toBe("PKR");
  });

  it("falls back to PKR only when rates cannot be loaded", async () => {
    vi.mocked(accountApi.fxRates).mockRejectedValue(new Error("offline"));
    await useCurrencyStore.getState().loadRates();
    expect(useCurrencyStore.getState()).toMatchObject({ currency: "PKR", rates: { PKR: "1" } });
  });

  it("converts with the chosen rate and keeps PKR as-is", () => {
    useCurrencyStore.setState({ rates, currency: "GBP" });
    expect(useCurrencyStore.getState().convert(535_000)).toEqual({ amount: 1_498, currency: "GBP" });
    useCurrencyStore.setState({ currency: "PKR" });
    expect(useCurrencyStore.getState().convert(535_000)).toEqual({ amount: 535_000, currency: "PKR" });
  });

  it("saves the choice to the profile for signed-in buyers", async () => {
    const user = { id: "u1", email: "a@b.c", full_name: null, role: "customer", locale: "en", currency_pref: "PKR", avatar_url: null, is_verified: true, created_at: "" } as const;
    useAuthStore.setState({ user: { ...user }, accessToken: "tok" });
    vi.mocked(accountApi.updateMe).mockResolvedValue({ ...user, currency_pref: "GBP" });
    useCurrencyStore.setState({ rates });

    await useCurrencyStore.getState().setCurrency("GBP");

    expect(accountApi.updateMe).toHaveBeenCalledWith({ currency_pref: "GBP" }, "tok");
    expect(useAuthStore.getState().user?.currency_pref).toBe("GBP");
    expect(window.localStorage.getItem("tahaif_currency")).toBe("GBP");
  });

  it("ignores currencies without a rate and does not call the API for guests", async () => {
    useCurrencyStore.setState({ rates });
    await useCurrencyStore.getState().setCurrency("EUR");
    expect(useCurrencyStore.getState().currency).toBe("PKR");
    await useCurrencyStore.getState().setCurrency("GBP");
    expect(useCurrencyStore.getState().currency).toBe("GBP");
    expect(accountApi.updateMe).not.toHaveBeenCalled();
  });
});
