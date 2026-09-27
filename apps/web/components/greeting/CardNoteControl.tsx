"use client";

import { useRef, useState } from "react";
import { CheckCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_NOTE_BYTES, notesApi } from "@/lib/notes";
import type { OrderItemRead } from "@/lib/cart";

type Props = { publicToken: string; item: OrderItemRead };

/**
 * Add, replace or remove a voice/video note for one gift's card. The shop
 * prints a QR code on the card that plays it. Only possible until the gift
 * leaves the shop (item.can_edit_note).
 */
export function CardNoteControl({ publicToken, item }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasNote, setHasNote] = useState(!!item.has_note);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!item.can_edit_note) {
    return hasNote ? (
      <p className="flex items-center gap-1.5 text-sm text-success">
        <CheckCircle aria-hidden className="h-4 w-4" /> A voice/video note is on the card
      </p>
    ) : null;
  }

  const upload = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      return setError("Choose an audio or video recording.");
    }
    if (file.size > MAX_NOTE_BYTES) return setError("The recording must be 25 MB or smaller (about 2 minutes of video).");
    setBusy("upload");
    try {
      await notesApi.attach(publicToken, item.id, file);
      setHasNote(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the recording.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setError(null);
    setBusy("remove");
    try {
      await notesApi.remove(publicToken, item.id);
      setHasNote(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the recording.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {hasNote && (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle aria-hidden className="h-4 w-4" /> Your note will play from a QR code on the card
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Voice or video note for ${item.product_name}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          <Mic aria-hidden className="h-4 w-4" />
          {busy === "upload" ? "Uploading…" : hasNote ? "Replace note" : "Add a voice or video note"}
        </Button>
        {hasNote && (
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove()}>
            {busy === "remove" ? "Removing…" : "Remove note"}
          </Button>
        )}
      </div>
      {!hasNote && (
        <p className="text-xs text-muted-foreground">
          Record a short message on your phone. They&apos;ll scan the card to hear or see you. Up to 25 MB.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
