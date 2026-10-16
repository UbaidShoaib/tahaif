"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { SOURCE_LABELS, socialOrdersApi, type QueueEntry } from "@/lib/social-orders";
import { openAndMark } from "@/components/admin/WhatsAppMessages";

/**
 * "Messages to send": every WhatsApp message due on open orders (ADR 0009).
 * Staff tap one, WhatsApp opens with the text filled in, they press send, and
 * it leaves the list. Work through it at 10:00, 14:00 and 18:00 (SOP §4).
 */
export function MessageQueue({ token }: { token: string }) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await socialOrdersApi.queue(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function send(entry: QueueEntry) {
    try {
      await openAndMark(entry.message, entry.order_id, token);
      setEntries((prev) =>
        prev.filter((e) => !(e.order_id === entry.order_id && e.message.kind === entry.message.kind)),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Sent, but could not record it. Try again.");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading messages…</p>;

  return (
    <div className="space-y-3">
      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">All caught up — no WhatsApp messages to send.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={`${e.order_id}-${e.message.kind}`} className="rounded-xl border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-mono">#{e.order_ref}</span> · {e.message.label} ·{" "}
                  <span className="text-muted-foreground">
                    {SOURCE_LABELS[e.source] ?? e.source} · {e.buyer_phone}
                  </span>
                </p>
                <Button size="sm" className="gap-1" onClick={() => void send(e)}>
                  <MessageCircle aria-hidden className="h-3 w-3" />
                  Open WhatsApp
                </Button>
              </div>
              <p className="whitespace-pre-line text-xs text-muted-foreground line-clamp-3">{e.message.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
