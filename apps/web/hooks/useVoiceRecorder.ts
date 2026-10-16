"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Formats the browser can record, in preference order (Chrome/Firefox → webm/ogg, Safari → mp4). */
const PREFERRED_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

/** Longest recording we allow; well under the 25 MB upload cap for audio. */
export const MAX_RECORDING_SECONDS = 120;

export const canRecordVoice = () =>
  typeof window !== "undefined" &&
  typeof window.MediaRecorder !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

const pickMimeType = () => PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));

const EXTENSIONS: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" };

/**
 * Record a voice note in the browser with MediaRecorder. `start()` asks for the
 * microphone; `stop()` resolves with the recording as a File whose type has no
 * codec suffix (the API matches the bare MIME type).
 */
export function useVoiceRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((file: File | null) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    cleanup();
  }, [cleanup]);

  const stop = useCallback(
    () =>
      new Promise<File | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        resolveRef.current = resolve;
        recorder.stop();
      }),
    [],
  );

  /** Throws if the microphone is unavailable or permission is denied. */
  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      const file = chunks.length
        ? new File(chunks, `voice-note.${EXTENSIONS[type] ?? "webm"}`, { type })
        : null;
      cleanup();
      resolveRef.current?.(file);
      resolveRef.current = null;
    };
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setRecording(true);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, [cleanup]);

  return { recording, seconds, start, stop };
}
