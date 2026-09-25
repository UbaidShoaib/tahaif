/**
 * Integer-only money helpers for display conversion. Amounts are minor units
 * (paisa, pence, cents); rates are PKR→currency decimal strings from the API.
 * The server's checkout quote remains the authoritative charge.
 */

const RATE_SCALE = 1_000_000; // rates carry at most 6 decimal places (NUMERIC(18,6))

/** "0.002800" → 2800 (millionths), without going through floating point. */
export function rateToMicros(rate: string): number {
  const [whole = "0", frac = ""] = rate.trim().split(".");
  const micros = Number(whole) * RATE_SCALE + Number(frac.padEnd(6, "0").slice(0, 6));
  if (!Number.isSafeInteger(micros) || micros < 0) throw new Error(`Invalid FX rate: ${rate}`);
  return micros;
}

/** Convert PKR paisa to the target currency's minor unit, rounding half up. */
export function convertFromPkr(amountPaisa: number, rate: string): number {
  const micros = rateToMicros(rate);
  if (micros === RATE_SCALE) return amountPaisa;
  const scaled = amountPaisa * micros;
  return Math.floor((scaled + RATE_SCALE / 2) / RATE_SCALE);
}

/** Format minor units: whole rupees for PKR, two decimals for other currencies. */
export function formatMoney(amountMinor: number, currency: string): string {
  const digits = currency === "PKR" ? 0 : 2;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 100);
}
