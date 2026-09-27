"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_THANKS_BYTES, MAX_THANKS_MESSAGE, thanksApi } from "@/lib/thanks";

type Props = { token: string; sender: string; alreadySent: boolean };

/** The recipient's reply: a few words and/or one photo, voice note or video. */
export function ThanksForm({ token, sender, alreadySent }: Props) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div role="status" className="space-y-2 rounded-xl border bg-success-soft p-6">
        <Heart aria-hidden className="mx-auto h-8 w-8 text-success" />
        <p className="font-semibold">Your thank-you is on its way to {sender} 💌</p>
        <p className="text-sm text-muted-foreground">It will mean a lot to them.</p>
      </div>
    );
  }

  const choose = (f: File | undefined) => {
    setError(null);
    if (!f) return setFile(null);
    if (!/^(image|audio|video)\//.test(f.type)) return setError("Choose a photo, voice note or video.");
    if (f.size > MAX_THANKS_BYTES) return setError("The file must be 25 MB or smaller.");
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !file) return setError("Write a few words or add a photo, voice note or video.");
    setSending(true);
    setError(null);
    try {
      await thanksApi.send(token, message, file);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4 text-start">
      {alreadySent && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          You&apos;ve already sent a thank-you. Sending again replaces it.
        </p>
      )}
      <FormField label="Your message" hint="Write in any language." id="thanks-message">
        {(p) => (
          <Textarea
            {...p}
            dir="auto"
            rows={4}
            maxLength={MAX_THANKS_MESSAGE}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Thank you ${sender}, I loved it!`}
          />
        )}
      </FormField>
      <FormField label="Add a photo, voice note or video" hint="Optional. Up to 25 MB." id="thanks-file">
        {(p) => <Input {...p} type="file" accept="image/*,audio/*,video/*" onChange={(e) => choose(e.target.files?.[0])} />}
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full gap-2" disabled={sending}>
        <Heart aria-hidden className="h-4 w-4" />
        {sending ? "Sending…" : `Send to ${sender}`}
      </Button>
    </form>
  );
}
