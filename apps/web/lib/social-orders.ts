/**
 * Orders staff take from Instagram DMs / WhatsApp chats, the hand-sent WhatsApp
 * messages that go with them, and the buyer's confirmation (ADR 0009).
 */
import { apiFetch } from "@/lib/api";
import type { OrderRead } from "@/lib/cart";

export type OrderSource = "instagram" | "whatsapp" | "phone" | "walk_in";

export type MessageKind =
  | "order_summary"
  | "payment_reminder"
  | "payment_received"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "recipient_on_the_way"
  | "recipient_delivered";

export interface WhatsAppMessage {
  kind: MessageKind;
  label: string;
  /** The buyer, or (while the WhatsApp API is off) the person receiving the gift. */
  to: "buyer" | "recipient";
  /** Their number, E.164. */
  phone: string;
  text: string;
  /** wa.me link that opens the buyer's chat with the text filled in. */
  url: string;
  due: boolean;
  sent_at: string | null;
}

export interface QueueEntry {
  order_id: string;
  order_ref: string;
  source: OrderSource | "web";
  /** Number this message goes to (the recipient's, for recipient messages). */
  buyer_phone: string;
  placed_at: string;
  message: WhatsAppMessage;
}

export interface AssistedOrderItem {
  product_id: string;
  variant_id?: string | null;
  qty: number;
  greeting_message?: string | null;
}

export interface AssistedOrderCreate {
  source: OrderSource;
  source_ref?: string | null;
  campaign?: string | null;
  buyer_phone: string;
  buyer_email?: string | null;
  items: AssistedOrderItem[];
  payment_method: "cod" | "bank_transfer";
  delivery_city_id: string;
  delivery_date: string;
  recipient_name: string;
  recipient_phone: string;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  notes?: string | null;
  coupon_code?: string | null;
  surprise: boolean;
  gift_from?: string | null;
  allow_duplicate?: boolean;
}

export interface AssistedOrderRead {
  order: OrderRead;
  messages: WhatsAppMessage[];
}

export interface OrderConfirm {
  accept_terms: true;
  marketing_opt_in: boolean;
  recipient_name?: string;
  recipient_phone?: string;
  address_line1?: string;
  landmark?: string;
}

export const SOURCE_LABELS: Record<string, string> = {
  web: "Website",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  walk_in: "Walk-in",
};

export const socialOrdersApi = {
  create: (body: AssistedOrderCreate, token: string, idempotencyKey: string) =>
    apiFetch<AssistedOrderRead>("/admin/orders/assisted", { method: "POST", body, token, idempotencyKey }),

  messages: (orderId: string, token: string) =>
    apiFetch<WhatsAppMessage[]>(`/admin/orders/${orderId}/whatsapp`, { token }),

  markSent: (orderId: string, kind: MessageKind, token: string) =>
    apiFetch<WhatsAppMessage>(`/admin/orders/${orderId}/whatsapp/${kind}/sent`, { method: "POST", token }),

  queue: (token: string) => apiFetch<QueueEntry[]>("/admin/whatsapp/queue", { token }),

  confirm: (publicToken: string, body: OrderConfirm) =>
    apiFetch<OrderRead>(`/orders/by-token/${publicToken}/confirm`, { method: "POST", body }),
};

export interface CampaignSalesRow {
  source: OrderSource | "web";
  /** Reel/post tag; null = not attributed. */
  campaign: string | null;
  orders: number;
  paid_orders: number;
  revenue_pkr: number;
  avg_order_pkr: number;
}

export interface CampaignSalesReport {
  days: number;
  rows: CampaignSalesRow[];
  total_orders: number;
  total_paid_orders: number;
  total_revenue_pkr: number;
}

export const reportsApi = {
  campaigns: (days: number, token: string) =>
    apiFetch<CampaignSalesReport>(`/admin/reports/campaigns?days=${days}`, { token }),
};
