import { currentCampaign } from "@/lib/campaign";
import { guestCartHeaders, syncGuestCartToken } from "@/lib/guest-cart";
import { apiFetch } from "@/lib/api";

/** Matches the API's greeting_message limit. */
export const GREETING_MAX = 500;

export interface CartItemRead {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  variant_id: string | null;
  variant_name: string | null;
  qty: number;
  unit_price_pkr: number;
  line_total_pkr: number;
  delivery_date: string | null;
  greeting_message: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
}

export interface CartRead {
  id: string | null;
  item_count: number;
  subtotal_pkr: number;
  items: CartItemRead[];
  /** Guest carts only (ADR 0004); stored and sent back as X-Cart-Token. */
  guest_token?: string | null;
}

export interface CartItemAdd {
  product_id: string;
  variant_id?: string | null;
  qty?: number;
  delivery_date?: string | null;
  greeting_message?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
}

export interface CartItemUpdate {
  qty: number;
  delivery_date?: string | null;
  greeting_message?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
}

export type PaymentMethod = "cod" | "bank_transfer";

export interface CheckoutPlace {
  payment_method: PaymentMethod;
  delivery_city_id: string;
  delivery_date: string;
  recipient_name: string;
  recipient_phone: string;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  notes?: string | null;
  coupon_code?: string | null;
  use_loyalty_points?: boolean;
  /** Required for guest checkout (ADR 0004). */
  contact_email?: string | null;
  contact_phone?: string | null;
  /** utm_campaign the visitor arrived with; added by cartApi.place. */
  campaign?: string | null;
}

export interface QuoteLineItem {
  product_name: string;
  variant_name: string | null;
  qty: number;
  unit_price_pkr: number;
  line_total_pkr: number;
}

export interface CheckoutQuote {
  items: QuoteLineItem[];
  subtotal_pkr: number;
  delivery_pkr: number;
  coupon_code: string | null;
  coupon_discount_pkr: number;
  loyalty_points_used: number;
  loyalty_discount_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  /** Currency the order will be charged in (falls back to PKR without a rate). */
  currency: string;
  /** PKR→currency rate, as a decimal string. */
  fx_rate: string;
  /** Total in the charge currency's minor unit. */
  total_charged: number;
}

export interface QuoteOptions {
  couponCode?: string | null;
  useLoyaltyPoints?: boolean;
  /** COD and bank transfer are always charged in PKR. */
  paymentMethod?: PaymentMethod;
}

export interface FulfillmentRead {
  id: string;
  vendor_name: string;
  status: string;
  delivery_date: string;
  delivery_slot: string | null;
  recipient_name: string;
  recipient_phone: string;
  address_line1: string;
  city_name: string;
  /** IANA zone of the delivery city, e.g. "Asia/Karachi". */
  city_timezone?: string | null;
  courier_tracking: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  /** Short-lived signed link to the proof-of-delivery photo. */
  delivery_photo_url?: string | null;
  received_by?: string | null;
  /** The recipient's thank-you, once they send one. */
  thanks?: ThanksRead | null;
}

export interface ThanksRead {
  message: string | null;
  /** Short-lived signed link to the photo/voice/video. */
  media_url: string | null;
  media_type: string | null;
  sent_at: string;
}

export interface OrderItemRead {
  id: string;
  product_name: string;
  /** The product's primary photo; null when it has none. */
  product_image_url?: string | null;
  variant_name: string | null;
  qty: number;
  unit_price_pkr: number;
  line_total_pkr: number;
  greeting_message: string | null;
  /** A voice/video note is attached to this item's card. */
  has_note?: boolean;
  note_content_type?: string | null;
  /** The note can still be added or replaced (the card isn't printed yet). */
  can_edit_note?: boolean;
  /** Build-your-own hamper/bouquet: what goes in it, e.g. "6 × Red Rose". */
  bucket_contents?: string[];
}

export interface OrderRead {
  id: string;
  public_token: string;
  status: string;
  currency: string;
  /** Total in the charge currency's minor unit. */
  total_charged: number;
  subtotal_pkr: number;
  delivery_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  placed_at: string;
  items: OrderItemRead[];
  fulfillments: FulfillmentRead[];
  /** No message to the recipient before delivery; the rider doesn't call ahead. */
  surprise?: boolean;
  /** Sender name used in messages to the recipient. */
  gift_from?: string | null;
  payment_method: PaymentMethod | null;
  /** Where the order came from: "web", or a chat staff took it from (ADR 0009). */
  source?: "web" | "instagram" | "whatsapp" | "phone" | "walk_in";
  customer_confirmed_at?: string | null;
  /** Taken by staff from a chat; the buyer must check and confirm it here. */
  needs_confirmation?: boolean;
}

/**
 * Cart and checkout calls work signed in (token) or as a guest (token null).
 * The guest cart header is added automatically, and every cart response updates
 * the stored guest token (see lib/guest-cart.ts).
 */
async function cartCall(path: string, token: string | null, init: { method?: string; body?: unknown } = {}) {
  const cart = await apiFetch<CartRead>(path, { ...init, token: token ?? undefined, headers: guestCartHeaders() });
  syncGuestCartToken(cart, !!token);
  return cart;
}

export const cartApi = {
  get: (token: string | null) => cartCall("/cart", token),

  addItem: (body: CartItemAdd, token: string | null) => cartCall("/cart/items", token, { method: "POST", body }),

  updateItem: (itemId: string, body: CartItemUpdate, token: string | null) =>
    cartCall(`/cart/items/${itemId}`, token, { method: "PATCH", body }),

  removeItem: (itemId: string, token: string | null) =>
    cartCall(`/cart/items/${itemId}`, token, { method: "DELETE" }),

  clear: (token: string | null) => cartCall("/cart", token, { method: "DELETE" }),

  quote: (cityId: string, token: string | null, opts: QuoteOptions = {}) => {
    const qs = new URLSearchParams({ city_id: cityId });
    if (opts.couponCode) qs.set("coupon_code", opts.couponCode);
    if (opts.useLoyaltyPoints) qs.set("use_loyalty_points", "true");
    if (opts.paymentMethod) qs.set("payment_method", opts.paymentMethod);
    return apiFetch<CheckoutQuote>(`/checkout/quote?${qs.toString()}`, {
      method: "POST",
      token: token ?? undefined,
      headers: guestCartHeaders(),
    });
  },

  place: (body: CheckoutPlace, token: string | null, idempotencyKey: string) =>
    apiFetch<OrderRead>("/checkout/place", {
      method: "POST",
      // Attribute website orders to the reel/story link the buyer came from.
      body: { ...body, campaign: body.campaign ?? currentCampaign() },
      token: token ?? undefined,
      idempotencyKey,
      headers: guestCartHeaders(),
    }),

  getOrder: (publicToken: string) =>
    apiFetch<OrderRead>(`/orders/${publicToken}`),

  myOrders: (token: string) =>
    apiFetch<OrderRead[]>("/orders/me", { token }),
};
