"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { socialOrdersApi, type QueueEntry } from "@/lib/social-orders";
import { zonedNow } from "@/lib/delivery";
import { PAKISTAN_TZ } from "@/lib/datetime";
import { formatPrice } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import { openAndMark } from "@/components/admin/WhatsAppMessages";
import type { OrderSummary } from "@/components/admin/OrderList";
import { Button } from "@/components/ui/button";

/** Orders that are paid for (or COD) but not yet with the recipient. */
const ACTIVE = ["paid", "preparing", "dispatched", "out_for_delivery"] as const;

type Row =
  | { kind: "receipt"; key: string; order: OrderSummary }
  | { kind: "whatsapp"; key: string; entry: QueueEntry }
  | { kind: "late"; key: string; order: OrderSummary; reason: string };

const code = (token: string) => token.slice(0, 8).toUpperCase();

/**
 * What counts as needing a human (layout decision: back office A, attention inbox):
 * - a bank-transfer receipt uploaded and waiting to be checked;
 * - a WhatsApp message due on an open order (the manual wa.me queue, ADR 0009);
 * - an order past its delivery day and not delivered, or due today and not started.
 */
export function attentionRows(
  pending: OrderSummary[],
  active: OrderSummary[],
  queue: QueueEntry[],
  today: string,
): Row[] {
  const receipts: Row[] = pending
    .filter((o) => o.payment_method === "bank_transfer" && o.proof_url)
    .map((o) => ({ kind: "receipt", key: `r-${o.id}`, order: o }));
  const messages: Row[] = queue.map((e) => ({ kind: "whatsapp", key: `w-${e.order_id}-${e.message.kind}`, entry: e }));
  const late: Row[] = active.flatMap((o): Row[] => {
    if (!o.delivery_date) return [];
    if (o.delivery_date < today) return [{ kind: "late", key: `l-${o.id}`, order: o, reason: "past its delivery day" }];
    if (o.delivery_date === today && o.status === "paid")
      return [{ kind: "late", key: `l-${o.id}`, order: o, reason: "due today, not started" }];
    return [];
  });
  return [...receipts, ...messages, ...late];
}

export function AttentionInbox({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = (status: string) =>
        apiFetch<{ items: OrderSummary[] }>(`/admin/orders?status=${status}&limit=100`, { token }).then((p) => p.items);
      const [pending, queue, ...active] = await Promise.all([
        list("pending_payment"),
        socialOrdersApi.queue(token),
        ...ACTIVE.map(list),
      ]);
      setRows(attentionRows(pending, active.flat(), queue, zonedNow(PAKISTAN_TZ).date));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Couldn't load what needs attention.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(() => void load(), busy === null, 60_000);

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await run();
      setRows((prev) => prev?.filter((r) => r.key !== key) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (rows === null && !error) return <p className="text-sm text-muted-foreground">Checking what needs attention…</p>;

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {rows && rows.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          All clear: no receipts, messages or late orders right now.
        </p>
      ) : (
        <ul aria-label="Needs attention" className="divide-y rounded-xl border">
          {rows?.map((row) => (
            <li key={row.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              {row.kind === "receipt" && (
                <>
                  <p className="text-sm">
                    <span className="me-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-ink">Receipt</span>
                    <Link href={`/admin/orders/${row.order.id}`} className="font-mono text-link hover:underline">
                      {code(row.order.public_token)}
                    </Link>{" "}
                    · {row.order.buyer_name ?? row.order.buyer_phone ?? "Guest"} · {formatPrice(row.order.total_pkr)}
                  </p>
                  <span className="flex gap-2">
                    {row.order.proof_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={row.order.proof_url} target="_blank" rel="noopener noreferrer">
                          View receipt
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      loading={busy === row.key}
                      onClick={() =>
                        void act(row.key, () =>
                          apiFetch(`/admin/orders/${row.order.id}/verify-payment`, {
                            method: "POST",
                            token,
                            body: { verified: true },
                          }),
                        )
                      }
                    >
                      Verify
                    </Button>
                  </span>
                </>
              )}
              {row.kind === "whatsapp" && (
                <>
                  <p className="text-sm">
                    <span className="me-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">WhatsApp</span>
                    <span className="font-mono">{row.entry.order_ref}</span> · {row.entry.message.label} not sent
                  </p>
                  <Button
                    size="sm"
                    loading={busy === row.key}
                    onClick={() => void act(row.key, () => openAndMark(row.entry.message, row.entry.order_id, token))}
                  >
                    Open wa.me
                  </Button>
                </>
              )}
              {row.kind === "late" && (
                <>
                  <p className="text-sm">
                    <span className="me-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-foreground">Late</span>
                    <span className="font-mono">{code(row.order.public_token)}</span> · {row.order.recipients.join(", ")} ·{" "}
                    {row.reason}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/orders/${row.order.id}`}>Open order</Link>
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
