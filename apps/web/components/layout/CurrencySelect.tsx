"use client";

import { useState } from "react";
import { useCurrencyStore } from "@/stores/currency.store";
import type { CurrencyCode } from "@/lib/account";

export function CurrencySelect() {
  const currency = useCurrencyStore((s) => s.currency);
  const rates = useCurrencyStore((s) => s.rates);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);
  const [error, setError] = useState<string | null>(null);
  const codes = Object.keys(rates).sort((a, b) => (a === "PKR" ? -1 : b === "PKR" ? 1 : a.localeCompare(b)));

  if (codes.length < 2) return null; // nothing to choose until FX rates exist

  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="sr-only">Currency</span>
      <select
        id="currency-select"
        value={currency}
        title={error ?? "Prices are shown and charged in this currency"}
        onChange={(e) => {
          setError(null);
          setCurrency(e.target.value as CurrencyCode).catch(() => setError("Could not save your currency"));
        }}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        {codes.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}
