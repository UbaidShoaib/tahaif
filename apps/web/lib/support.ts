/**
 * Human support on WhatsApp, which is how overseas buyers already talk to family
 * at home. Config only (like lib/brand.ts): with no number set, nothing renders.
 *
 *   NEXT_PUBLIC_SUPPORT_WHATSAPP  international number, e.g. "+92 300 1234567"
 *   NEXT_PUBLIC_SUPPORT_HOURS     opening hours in Pakistan time, "HH:MM-HH:MM"
 */

export type SupportHours = { open: string; close: string };

/** wa.me wants digits only, with the country code and no "+". */
export function whatsappDigits(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** "09:00-21:00" → { open: "09:00", close: "21:00" }; anything else → 9am–9pm. */
export function parseHours(raw: string | undefined): SupportHours {
  const m = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(raw ?? "");
  return m ? { open: m[1].padStart(5, "0"), close: m[2].padStart(5, "0") } : { open: "09:00", close: "21:00" };
}

export const support = {
  whatsapp: whatsappDigits(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP),
  hours: parseHours(process.env.NEXT_PUBLIC_SUPPORT_HOURS),
};

/** Chat link, optionally with a pre-filled first message. */
export function whatsappLink(digits: string, message?: string): string {
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
