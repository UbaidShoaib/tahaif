"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Mic, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_RECORDING_SECONDS, canRecordVoice, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
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
  const [supportsRecording, setSupportsRecording] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const recorder = useVoiceRecorder();

  useEffect(() => setSupportsRecording(canRecordVoice()), []);

  useEffect(() => {
    if (recorder.recording && recorder.seconds >= MAX_RECORDING_SECONDS) void finishRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording, recorder.seconds]);

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
      await notesApi.attach(publicToken, item.id, file, accepted);
      setHasNote(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the recording.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      await recorder.start();
    } catch {
      setError("We couldn't use your microphone. Allow microphone access, or upload a recording instead.");
    }
  };

  async function finishRecording() {
    const file = await recorder.stop();
    if (file) await upload(file);
  }

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
      {!recorder.recording && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            My note is respectful and follows the{" "}
            <Link href="/terms#card-notes" target="_blank" className="text-link underline underline-offset-4">
              content rules
            </Link>
            . I&apos;m responsible for what I record.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {recorder.recording ? (
          <Button type="button" size="sm" variant="destructive" className="gap-2" onClick={() => void finishRecording()}>
            <Square aria-hidden className="h-4 w-4" />
            Stop &amp; save ({formatSeconds(recorder.seconds)})
          </Button>
        ) : (
          supportsRecording && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={busy !== null || !accepted}
              onClick={() => void startRecording()}
            >
              <Mic aria-hidden className="h-4 w-4" />
              {busy === "upload" ? "Uploading…" : hasNote ? "Record again" : "Record a voice note"}
            </Button>
          )
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={busy !== null || recorder.recording || !accepted}
          onClick={() => inputRef.current?.click()}
        >
          <Upload aria-hidden className="h-4 w-4" />
          {busy === "upload" && !supportsRecording
            ? "Uploading…"
            : hasNote
              ? "Replace note"
              : supportsRecording
                ? "Upload a recording"
                : "Add a voice or video note"}
        </Button>
        {hasNote && !recorder.recording && (
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove()}>
            {busy === "remove" ? "Removing…" : "Remove note"}
          </Button>
        )}
      </div>
      {recorder.recording && (
        <p role="status" className="text-xs text-destructive">
          Recording… up to {MAX_RECORDING_SECONDS / 60} minutes. Tap stop when you&apos;re done.
        </p>
      )}
      {!hasNote && !recorder.recording && (
        <p className="text-xs text-muted-foreground">
          Record a short message here, or upload one from your phone. They&apos;ll scan the card to hear or see you. Up to 25 MB.
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

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
