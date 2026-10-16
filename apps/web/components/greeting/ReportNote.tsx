"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_REPORT_REASONS, type NoteReportReason, notesApi } from "@/lib/notes";

/**
 * "Report this message" on the note page. No login: whoever has the card's QR
 * link can report it. The API keeps one report per note per IP.
 */
export function ReportNote({ noteToken }: { noteToken: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<NoteReportReason>("abusive");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Thank you. We&apos;ve received your report and will review this message.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        <Flag aria-hidden className="h-3.5 w-3.5" /> Report this message
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      await notesApi.report(noteToken, { reason, details: details.trim() || undefined });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Could not send your report. Please try again.");
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-xl border p-4 text-start">
      <h2 className="font-semibold">Report this message</h2>
      <div className="space-y-1.5">
        <Label htmlFor="report-reason">What&apos;s wrong with it?</Label>
        <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as NoteReportReason)}>
          {Object.entries(NOTE_REPORT_REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-details">Anything else we should know? (optional)</Label>
        <Textarea
          id="report-details"
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send report"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
