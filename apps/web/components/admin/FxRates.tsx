"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionNotices, errorText, useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fxApi, type FxCurrency } from "@/lib/back-office-admin";

/** "0.003600" per rupee → "Rs 277.78" per unit, which is how people quote it. */
export function rupeesPerUnit(rate: string | null): string {
  const r = Number(rate);
  if (!rate || !(r > 0)) return "—";
  return `Rs ${(1 / r).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Rupees per unit as typed → the stored rate (units per rupee), or null when it isn't a positive number. */
export function rateFromRupees(text: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return null;
  const rupees = Number(text.trim());
  return rupees > 0 ? (1 / rupees).toFixed(6) : null;
}

/**
 * Rates used to charge buyers abroad. The automatic rate is fetched daily; a manual rate
 * wins over it until cleared. Rates are entered as rupees per unit (e.g. 1 GBP = Rs 360).
 */
export function FxRates({ token }: { token: string }) {
  const [rates, setRates] = useState<FxCurrency[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});

  const load = useCallback(() => fxApi.list(token).then(setRates), [token]);
  const { busy, error, ok, run, fail } = useAdminAction(load);

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)));
  }, [load]);

  async function override(code: string) {
    const rate = rateFromRupees(typed[code] ?? "");
    if (!rate) return fail(`Enter how many rupees one ${code} costs, e.g. 360.`);
    if (await run(() => fxApi.override(token, code, rate), `${code} fixed at Rs ${typed[code]}.`)) {
      setTyped(({ [code]: _, ...rest }) => rest);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Buyers abroad pay in their own currency at these rates. A manual rate stays until you clear it, even when the daily rate moves.
      </p>
      <ActionNotices error={error ?? loadError} ok={ok} />
      {!rates && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rates && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th scope="col" className="p-3 font-medium">Currency</th>
                <th scope="col" className="p-3 font-medium">Daily rate</th>
                <th scope="col" className="p-3 font-medium">Charged at</th>
                <th scope="col" className="p-3 font-medium">Set by hand (Rs per unit)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rates.map((c) => (
                <tr key={c.quote_currency}>
                  <th scope="row" className="p-3 text-left font-mono font-medium">{c.quote_currency}</th>
                  <td className="p-3">
                    {rupeesPerUnit(c.auto?.rate ?? null)}
                    {c.auto && <span className="block text-xs text-muted-foreground">updated {new Date(c.auto.fetched_at).toLocaleDateString("en-GB")}</span>}
                  </td>
                  <td className="p-3">
                    {c.effective_rate ? rupeesPerUnit(c.effective_rate) : <Badge variant="warning">Not chargeable yet</Badge>}
                    {c.manual && <Badge variant="info" className="ms-2">Manual</Badge>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input aria-label={`Rupees per ${c.quote_currency}`} inputMode="decimal" className="w-28"
                        value={typed[c.quote_currency] ?? ""} onChange={(e) => setTyped((t) => ({ ...t, [c.quote_currency]: e.target.value }))} />
                      <Button size="sm" disabled={busy} onClick={() => void override(c.quote_currency)}>Set</Button>
                      {c.manual && (
                        <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => void run(() => fxApi.clear(token, c.quote_currency), `${c.quote_currency} is back on the daily rate.`)}>
                          Use daily rate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
