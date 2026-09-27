"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { PAKISTAN_TZ, cityTimeToInstant, formatClock, sameClock, viewerTimeZone } from "@/lib/datetime";
import { zonedNow } from "@/lib/delivery";
import { support as defaultSupport, whatsappLink, type SupportHours } from "@/lib/support";

type Props = {
  /** Pre-filled first message, e.g. with the order number. */
  message?: string;
  label?: string;
  /** Overrides env config (tests). */
  config?: { whatsapp: string | null; hours: SupportHours };
};

function hoursIn(hours: SupportHours, zone: string): string {
  const today = zonedNow(PAKISTAN_TZ).date;
  const open = cityTimeToInstant(today, hours.open, PAKISTAN_TZ);
  const close = cityTimeToInstant(today, hours.close, PAKISTAN_TZ);
  return `${formatClock(open, zone)}–${formatClock(close, zone)}`;
}

/**
 * WhatsApp support button with opening hours in Pakistan time and, after
 * mount, in the buyer's own time, so someone in London knows 9am–9pm PKT
 * means 5am–5pm for them. Renders nothing when no number is configured.
 */
export function SupportWhatsApp({ message, label = "Chat with us on WhatsApp", config = defaultSupport }: Props) {
  const [yourHours, setYourHours] = useState<string | null>(null);
  const { open, close } = config.hours;

  useEffect(() => {
    const viewer = viewerTimeZone();
    if (!viewer || sameClock(PAKISTAN_TZ, viewer)) return;
    setYourHours(`${hoursIn({ open, close }, viewer)} your time`);
  }, [open, close]);

  if (!config.whatsapp) return null;

  return (
    <div className="space-y-1">
      <a
        href={whatsappLink(config.whatsapp, message)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-link hover:bg-muted"
      >
        <MessageCircle aria-hidden className="h-4 w-4" />
        {label}
      </a>
      <p className="text-xs text-muted-foreground">
        A real person replies {hoursIn(config.hours, PAKISTAN_TZ)} PKT
        {yourHours && <> ({yourHours})</>}
      </p>
    </div>
  );
}
