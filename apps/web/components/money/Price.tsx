"use client";

import { useCurrencyStore } from "@/stores/currency.store";
import { convertFromPkr, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Shows a PKR paisa amount in the buyer's chosen currency. Non-PKR amounts are
 * marked as approximate and keep the rupee price in the tooltip, because the
 * exact charge is fixed by the checkout quote.
 */
export function Price({ pkr, className, from }: { pkr: number; className?: string; from?: boolean }) {
  const currency = useCurrencyStore((s) => s.currency);
  const rate = useCurrencyStore((s) => s.rates[s.currency]);
  const prefix = from ? "From " : "";

  if (currency === "PKR" || !rate) {
    return <span className={cn("tabular-nums", className)}>{prefix}{formatMoney(pkr, "PKR")}</span>;
  }
  const converted = formatMoney(convertFromPkr(pkr, rate), currency);
  return (
    <span className={cn("tabular-nums", className)} title={`${formatMoney(pkr, "PKR")}, final amount confirmed at checkout`}>
      {prefix}≈ {converted}
    </span>
  );
}
