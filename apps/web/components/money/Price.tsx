"use client";

import { useCurrencyStore } from "@/stores/currency.store";
import { convertFromPkr, formatMoney } from "@/lib/money";

/**
 * Shows a PKR paisa amount in the buyer's chosen currency. Non-PKR amounts are
 * marked as approximate and keep the rupee price in the tooltip, because the
 * exact charge is fixed by the checkout quote.
 */
export function Price({ pkr, className }: { pkr: number; className?: string }) {
  const currency = useCurrencyStore((s) => s.currency);
  const rate = useCurrencyStore((s) => s.rates[s.currency]);

  if (currency === "PKR" || !rate) return <span className={className}>{formatMoney(pkr, "PKR")}</span>;
  return (
    <span className={className} title={`${formatMoney(pkr, "PKR")}, final amount confirmed at checkout`}>
      ≈ {formatMoney(convertFromPkr(pkr, rate), currency)}
    </span>
  );
}
