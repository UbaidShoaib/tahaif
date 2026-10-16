"use client";

import { MessageCircle } from "lucide-react";
import { captureEvent } from "@/components/providers";
import { currentCampaign, orderMessage, type OrderOnWhatsAppInput } from "@/lib/order-on-whatsapp";
import { support as defaultSupport, whatsappLink } from "@/lib/support";

type Props = Omit<OrderOnWhatsAppInput, "productUrl" | "campaign"> & {
  productId: string;
  productPath: string;
  /** Overrides env config (tests). */
  whatsapp?: string | null;
};

/**
 * For buyers who'd rather order by chat (many of our Instagram customers):
 * opens WhatsApp with the product, option, city and card message filled in.
 * Renders nothing when no business number is configured.
 */
export function OrderOnWhatsApp({ productId, productPath, whatsapp = defaultSupport.whatsapp, ...rest }: Props) {
  if (!whatsapp) return null;
  const digits = whatsapp;

  function open() {
    // Built at click time: the URL and the visit's campaign are only known in the browser.
    const campaign = currentCampaign();
    const text = orderMessage({ ...rest, productUrl: `${window.location.origin}${productPath}`, campaign });
    captureEvent("order_on_whatsapp", { product_id: productId, campaign });
    window.open(whatsappLink(digits, text), "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-link hover:bg-muted"
    >
      <MessageCircle aria-hidden className="h-4 w-4" />
      Prefer to chat? Order on WhatsApp
    </button>
  );
}
