"use client";

import { create } from "zustand";
import { accountApi, SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/account";
import { convertFromPkr } from "@/lib/money";
import { useAuthStore } from "@/stores/auth.store";

const STORAGE_KEY = "tahaif_currency";

interface CurrencyState {
  currency: CurrencyCode;
  /** PKR→currency decimal-string rates for currencies we can charge in. */
  rates: Record<string, string>;
  loadRates: () => Promise<void>;
  /** Signed-in buyers are charged in their profile currency, so it is saved there. */
  setCurrency: (code: CurrencyCode) => Promise<void>;
  syncFromUser: (pref: string | null | undefined) => void;
  /** PKR paisa → { amount in the display currency's minor unit, currency }. */
  convert: (amountPaisa: number) => { amount: number; currency: string };
}

function isSupported(code: string | null | undefined): code is CurrencyCode {
  return !!code && (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

function readStored(): CurrencyCode | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isSupported(v) ? v : null;
  } catch {
    return null;
  }
}

function store(code: CurrencyCode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable (private mode) — the choice lasts for this visit */
  }
}

export const useCurrencyStore = create<CurrencyState>((set, get) => ({
  currency: "PKR",
  rates: { PKR: "1" },

  loadRates: async () => {
    try {
      const { rates } = await accountApi.fxRates();
      const stored = typeof window !== "undefined" ? readStored() : null;
      const current = stored ?? get().currency;
      set({ rates, currency: rates[current] ? current : "PKR" });
    } catch {
      set({ rates: { PKR: "1" }, currency: "PKR" });
    }
  },

  setCurrency: async (code) => {
    if (!get().rates[code]) return;
    set({ currency: code });
    store(code);
    const { accessToken, user, setSession } = useAuthStore.getState();
    if (accessToken && user && user.currency_pref !== code) {
      const updated = await accountApi.updateMe({ currency_pref: code }, accessToken);
      setSession(updated, accessToken);
    }
  },

  syncFromUser: (pref) => {
    if (isSupported(pref) && get().rates[pref]) {
      set({ currency: pref });
      store(pref);
    }
  },

  convert: (amountPaisa) => {
    const { currency, rates } = get();
    const rate = rates[currency];
    if (currency === "PKR" || !rate) return { amount: amountPaisa, currency: "PKR" };
    return { amount: convertFromPkr(amountPaisa, rate), currency };
  },
}));
