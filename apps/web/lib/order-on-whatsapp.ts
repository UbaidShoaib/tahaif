/**
 * "Order on WhatsApp" from a product page (ADR 0009, P1): opens a chat with our
 * business number and a first message that already says what they want, so staff
 * can enter it with "New DM order" without asking again.
 */
import { formatPrice } from "@/lib/utils";

export type OrderOnWhatsAppInput = {
  productName: string;
  variantName?: string | null;
  pricePkr: number;
  cityName?: string | null;
  greeting?: string | null;
  productUrl: string;
  campaign?: string | null;
};

export function orderMessage(i: OrderOnWhatsAppInput): string {
  const lines = [
    "Assalam-o-Alaikum! I'd like to order:",
    `• ${i.productName}${i.variantName ? ` (${i.variantName})` : ""} — ${formatPrice(i.pricePkr)}`,
  ];
  if (i.cityName) lines.push(`Deliver in: ${i.cityName}`);
  const greeting = i.greeting?.trim();
  if (greeting) lines.push(`Card message: "${greeting}"`);
  lines.push(i.productUrl);
  // Staff copy this into "Reel / campaign" so we know which post sold it.
  if (i.campaign) lines.push(`(ref: ${i.campaign})`);
  return lines.join("\n");
}
