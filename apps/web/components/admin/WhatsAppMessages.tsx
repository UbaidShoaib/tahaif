"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  messageText,
  messageUrl,
  socialOrdersApi,
  type MessageLanguage,
  type WhatsAppMessage,
} from "@/lib/social-orders";
import { MessageLanguageToggle, useMessageLanguage } from "@/components/admin/MessageLanguageToggle";

/**
 * Opens WhatsApp with the message filled in, and records it as sent (ADR 0009).
 * The window opens first, synchronously, so browsers don't block it as a popup.
 */
export function openAndMark(
  message: WhatsAppMessage,
  orderId: string,
  token: string,
  lang: MessageLanguage = "en",
): Promise<WhatsAppMessage> {
  window.open(messageUrl(message, lang), "_blank", "noopener,noreferrer");
  return socialOrdersApi.markSent(orderId, message.kind, token);
}

/** Every WhatsApp message for one order: due ones highlighted, sent ones ticked. */
export function WhatsAppMessages({
  orderId,
  token,
  initial,
}: {
  orderId: string;
  token: string;
  initial?: WhatsAppMessage[];
}) {
  const [messages, setMessages] = useState<WhatsAppMessage[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useMessageLanguage();

  const load = useCallback(async () => {
    try {
      setMessages(await socialOrdersApi.messages(orderId, token));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load messages.");
    }
  }, [orderId, token]);

  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  async function send(m: WhatsAppMessage) {
    setError(null);
    try {
      const updated = await openAndMark(m, orderId, token, lang);
      setMessages((prev) => prev?.map((x) => (x.kind === updated.kind ? updated : x)) ?? prev);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Sent, but could not record it. Try again.");
    }
  }

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!messages) return <p className="text-sm text-muted-foreground">Loading messages…</p>;
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No buyer phone on this order, so no WhatsApp messages.</p>;
  }

  return (
    <div className="space-y-2">
    <MessageLanguageToggle value={lang} onChange={setLang} />
    <ul className="flex flex-wrap gap-2" aria-label="WhatsApp messages">
      {messages.map((m) => (
        <li key={m.kind}>
          <Button
            size="sm"
            variant={m.due ? "default" : "outline"}
            className="gap-1"
            title={messageText(m, lang)}
            onClick={() => void send(m)}
          >
            {m.sent_at ? <Check aria-hidden className="h-3 w-3" /> : <MessageCircle aria-hidden className="h-3 w-3" />}
            {m.label}
            {m.sent_at && <span className="sr-only"> (sent)</span>}
            {m.due && <span className="sr-only"> (due now)</span>}
          </Button>
        </li>
      ))}
    </ul>
    </div>
  );
}
