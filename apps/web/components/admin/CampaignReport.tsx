"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { SOURCE_LABELS, reportsApi, type CampaignSalesReport } from "@/lib/social-orders";
import { formatPrice } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;

/**
 * Which channels and Instagram reels actually sell (ADR 0009). Campaigns come
 * from "Reel / campaign" on DM orders and from ?utm_campaign= on website visits.
 */
export function CampaignReport({ token }: { token: string }) {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<CampaignSalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    reportsApi
      .campaigns(days, token)
      .then((r) => { if (live) setReport(r); })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.detail : "Could not load the report."); });
    return () => { live = false; };
  }, [days, token]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
        {RANGES.map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} aria-pressed={days === d} onClick={() => setDays(d)}>
            Last {d} days
          </Button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!report && !error && <p className="text-sm text-muted-foreground">Loading report…</p>}

      {report && (
        report.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders in the last {report.days} days.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <caption className="sr-only">Sales by channel and campaign, last {report.days} days</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Campaign</th>
                  <th scope="col" className="px-3 py-2 font-medium">Channel</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Orders</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Avg order</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={`${r.source}-${r.campaign ?? ""}`} className="border-t">
                    <td className="px-3 py-2 font-mono">{r.campaign ?? <span className="text-muted-foreground">(none)</span>}</td>
                    <td className="px-3 py-2">{SOURCE_LABELS[r.source] ?? r.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.orders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.paid_orders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPrice(r.revenue_pkr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.paid_orders ? formatPrice(r.avg_order_pkr) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <th scope="row" colSpan={2} className="px-3 py-2 text-left">Total</th>
                  <td className="px-3 py-2 text-right tabular-nums">{report.total_orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{report.total_paid_orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPrice(report.total_revenue_pkr)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
      <p className="text-xs text-muted-foreground">
        &quot;Paid&quot; = moved past payment; revenue counts only those. Cancelled and refunded orders are left out.
        Tag Instagram links with <code>?utm_campaign=reel-name</code> and type the same name in &quot;Reel / campaign&quot; on DM orders.
      </p>
    </div>
  );
}
