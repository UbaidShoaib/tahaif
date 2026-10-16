/**
 * "Order on WhatsApp" from a product page (ADR 0009, P1): opens a chat with our
 * business number and a first message that already says what they want, so staff
 * can enter it with "New DM order" without asking again.
 */
import { formatPrice } from "@/lib/utils";

const CAMPAIGN_KEY = "utm_campaign";

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

/**
 * The campaign the visitor arrived with (?utm_campaign=… on the Instagram bio or
 * story link), remembered for the visit so it survives browsing to another product.
 * Browser only; storage failures (private mode) just mean no campaign.
 */
export function currentCampaign(search: string = window.location.search): string | null {
  const fromUrl = new URLSearchParams(search).get(CAMPAIGN_KEY)?.trim().slice(0, 100) || null;
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(CAMPAIGN_KEY, fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem(CAMPAIGN_KEY);
  } catch {
    return fromUrl;
  }
}
