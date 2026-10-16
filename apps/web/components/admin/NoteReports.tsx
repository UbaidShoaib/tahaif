"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { NOTE_REPORT_REASONS, type NoteReportReason } from "@/lib/notes";

interface NoteReport {
  id: string;
  reason: NoteReportReason;
  details: string | null;
  status: "open" | "note_disabled" | "dismissed";
  created_at: string;
}

interface ReportedNote {
  item_id: string;
  order_id: string;
  public_token: string;
  product_name: string;
  greeting_message: string | null;
  content_type: string | null;
  media_url: string | null;
  consent_at: string | null;
  consent_ip: string | null;
  disabled_at: string | null;
  last_reported_at: string;
  reports: NoteReport[];
}

const STATUS_LABELS: Record<NoteReport["status"], string> = {
  open: "Open",
  note_disabled: "Taken down",
  dismissed: "Dismissed",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-PK");

/**
 * Review queue for reported card voice/video notes (ADR 0010). Staff listen,
 * then take the note down (QR stops playing; recording kept as evidence) or
 * dismiss the reports.
 */
export function NoteReports({ token }: { token: string }) {
  const [view, setView] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<ReportedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiFetch<ReportedNote[]>(`/admin/note-reports?status=${view}`, { token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [token, view]);

  useEffect(() => { void load(); }, [load]);

  async function act(itemId: string, action: "disable" | "dismiss" | "restore") {
    setBusy(itemId);
    setError(null);
    try {
      await apiFetch(`/admin/note-reports/${itemId}/${action}`, { method: "POST", token });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not save that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Which reports">
        {(["open", "all"] as const).map((v) => (
          <Button key={v} size="sm" variant={view === v ? "default" : "outline"} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "open" ? "Needs review" : "All reports"}
          </Button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === "open" ? "No reported notes are waiting." : "No notes have been reported."}
        </p>
      ) : (
        rows.map((n) => {
          const open = n.reports.some((r) => r.status === "open");
          const isVideo = n.content_type?.startsWith("video/");
          return (
            <article key={n.item_id} aria-label={`Reported note on ${n.product_name}`} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="font-semibold">{n.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.reports.length} report{n.reports.length === 1 ? "" : "s"} · last {when(n.last_reported_at)}
                  </p>
                </div>
                {n.disabled_at && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Taken down {when(n.disabled_at)}
                  </span>
                )}
              </div>

              {n.media_url && n.content_type ? (
                isVideo ? (
                  <video controls playsInline preload="none" className="w-full max-w-md rounded-lg border bg-black">
                    <source src={n.media_url} type={n.content_type} />
                  </video>
                ) : (
                  <audio controls preload="none" className="w-full max-w-md">
                    <source src={n.media_url} type={n.content_type} />
                  </audio>
                )
              ) : (
                <p className="text-sm text-muted-foreground">The recording isn&apos;t available (removed by the buyer or storage is down).</p>
              )}

              {n.greeting_message && (
                <p className="rounded-lg bg-muted/40 p-3 text-sm">
                  <span className="text-muted-foreground">Card message: </span>{n.greeting_message}
                </p>
              )}

              <ul className="space-y-2 text-sm">
                {n.reports.map((r) => (
                  <li key={r.id} className="rounded-lg border p-2">
                    <p>
                      <span className="font-medium">{NOTE_REPORT_REASONS[r.reason] ?? r.reason}</span>
                      <span className="text-muted-foreground"> · {when(r.created_at)} · {STATUS_LABELS[r.status]}</span>
                    </p>
                    {r.details && <p className="mt-1 text-muted-foreground">&ldquo;{r.details}&rdquo;</p>}
                  </li>
                ))}
              </ul>

              <p className="text-xs text-muted-foreground">
                Buyer agreed to the content rules {n.consent_at ? `${when(n.consent_at)} from ${n.consent_ip ?? "unknown IP"}` : "— no record"}
                {" · "}
                <Link href={`/track/${n.public_token}`} target="_blank" className="text-link underline-offset-2 hover:underline">
                  Open order<span className="sr-only"> (opens in a new tab)</span>
                </Link>
              </p>

              <div className="flex flex-wrap gap-2">
                {!n.disabled_at && (
                  <Button size="sm" variant="destructive" className="gap-1" disabled={busy === n.item_id} onClick={() => void act(n.item_id, "disable")}>
                    <Ban aria-hidden className="h-3 w-3" /> Take note down
                  </Button>
                )}
                {open && !n.disabled_at && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === n.item_id} onClick={() => void act(n.item_id, "dismiss")}>
                    <CheckCircle aria-hidden className="h-3 w-3" /> Nothing wrong — dismiss
                  </Button>
                )}
                {n.disabled_at && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === n.item_id} onClick={() => void act(n.item_id, "restore")}>
                    <RotateCcw aria-hidden className="h-3 w-3" /> Restore note
                  </Button>
                )}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
