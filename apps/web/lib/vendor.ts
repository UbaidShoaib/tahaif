import { apiFetch } from "@/lib/api";

export interface VendorRead {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city_id: string;
  is_active: boolean;
}

export interface VendorUpdate {
  name?: string;
  description?: string | null;
  logo_url?: string | null;
}

export type FulfillmentStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "failed";

export interface VendorLineItem {
  product_name: string;
  variant_name: string | null;
  qty: number;
  /** Buyer's card message, printed and sent with this item. */
  greeting_message: string | null;
  /** Print a QR code to /note/{note_token} on the card when set. */
  note_token: string | null;
}

export interface VendorFulfillmentRead {
  id: string;
  order_id: string;
  public_token: string;
  order_status: string;
  payment_method: string | null;
  status: FulfillmentStatus;
  delivery_date: string;
  delivery_slot: string | null;
  recipient_name: string;
  recipient_phone: string;
  address_line1: string;
  address_line2: string | null;
  city_name: string;
  landmark: string | null;
  courier_tracking: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  /** Short-lived signed link to the proof-of-delivery photo. */
  delivery_photo_url: string | null;
  received_by: string | null;
  item_count: number;
  subtotal_pkr: number;
  items: VendorLineItem[];
  /** Surprise gift: don't call the recipient ahead, and include no receipt or price. */
  surprise: boolean;
}

export interface FulfillmentStatusUpdate {
  status: FulfillmentStatus;
  courier_tracking?: string | null;
}

export interface VendorProductRead {
  id: string;
  name: string;
  slug: string;
  base_price_pkr: number;
  is_active: boolean;
}

export const vendorApi = {
  getMe: (token: string) =>
    apiFetch<VendorRead>("/vendor/me", { token }),

  updateMe: (body: VendorUpdate, token: string) =>
    apiFetch<VendorRead>("/vendor/me", { method: "PATCH", body, token }),

  listFulfillments: (token: string, filterStatus?: FulfillmentStatus) => {
    const qs = filterStatus ? `?filter_status=${filterStatus}` : "";
    return apiFetch<VendorFulfillmentRead[]>(`/vendor/fulfillments${qs}`, { token });
  },

  getFulfillment: (id: string, token: string) =>
    apiFetch<VendorFulfillmentRead>(`/vendor/fulfillments/${id}`, { token }),

  updateFulfillment: (id: string, body: FulfillmentStatusUpdate, token: string) =>
    apiFetch<VendorFulfillmentRead>(`/vendor/fulfillments/${id}`, {
      method: "PATCH",
      body,
      token,
    }),

  /** Attach a delivery photo and mark the fulfillment delivered (replaces the photo if already delivered). */
  confirmDeliveryWithPhoto: (id: string, photo: File, receivedBy: string, token: string) => {
    const form = new FormData();
    form.append("file", photo);
    if (receivedBy.trim()) form.append("received_by", receivedBy.trim());
    return apiFetch<VendorFulfillmentRead>(`/vendor/fulfillments/${id}/delivery-photo`, {
      method: "POST",
      body: form,
      token,
    });
  },

  listProducts: (token: string, page = 1) =>
    apiFetch<VendorProductRead[]>(`/vendor/products?page=${page}`, { token }),
};
