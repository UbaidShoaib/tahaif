"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import type { VendorApplication } from "@/components/vendor/SellApplication";

type AdminApplication = VendorApplication & { applicant_email: string; applicant_name: string | null };

/** The review queue: shops people applied to open, waiting for a decision. */
export function VendorApplications({ token }: { token: string }) {
  const [rows, setRows] = useState<AdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The application whose rejection note is being written.
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiFetch<AdminApplication[]>("/admin/vendor-applications?status=pending", { token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/admin/vendor-applications/${id}/${action}`, {
        method: "POST",
        token,
        body: action === "reject" ? { note: note.trim() || null } : undefined,
      });
      setRejecting(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not save the decision.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading applications…</p>;

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shop applications are waiting.</p>
      ) : (
        rows.map((a) => (
          <div key={a.id} className="space-y-3 rounded-xl border p-4">
            <div className="space-y-0.5">
              <p className="font-semibold">{a.name}</p>
              <p className="text-sm text-muted-foreground">
                {a.city_name} · {a.contact_phone}
              </p>
              <p className="text-sm text-muted-foreground">
                {a.applicant_name ? `${a.applicant_name} · ` : ""}{a.applicant_email}
              </p>
              <p className="text-xs text-muted-foreground">
                Applied {new Date(a.created_at).toLocaleString("en-PK")}
              </p>
            </div>
            {a.description && <p className="text-sm">{a.description}</p>}

            {rejecting === a.id ? (
              <div className="space-y-2">
                <Label htmlFor={`note-${a.id}`}>Reason (shown to the applicant, optional)</Label>
                <Textarea id={`note-${a.id}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="destructive" disabled={busy === a.id} onClick={() => void decide(a.id, "reject")}>
                    Confirm rejection
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setNote(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-success text-white hover:bg-success/90 dark:text-background"
                  disabled={busy === a.id}
                  onClick={() => void decide(a.id, "approve")}
                >
                  <CheckCircle aria-hidden className="h-3 w-3" /> Approve shop
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1"
                  disabled={busy === a.id}
                  onClick={() => { setRejecting(a.id); setNote(""); }}
                >
                  <XCircle aria-hidden className="h-3 w-3" /> Reject
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
