import { apiFetch } from "@/lib/api";

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
  total_pkr: number;
  currency: string;
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
  courier_tracking: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
}

export interface OrderItemRead {
  id: string;
  product_name: string;
  variant_name: string | null;
  qty: number;
  unit_price_pkr: number;
  line_total_pkr: number;
  greeting_message: string | null;
}

export interface OrderRead {
  id: string;
  public_token: string;
  status: string;
  currency: string;
  subtotal_pkr: number;
  delivery_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  placed_at: string;
  items: OrderItemRead[];
  fulfillments: FulfillmentRead[];
  payment_method: PaymentMethod | null;
}

export const cartApi = {
  get: (token: string) =>
    apiFetch<CartRead>("/cart", { token }),

  addItem: (body: CartItemAdd, token: string) =>
    apiFetch<CartRead>("/cart/items", { method: "POST", body, token }),

  updateItem: (itemId: string, body: CartItemUpdate, token: string) =>
    apiFetch<CartRead>(`/cart/items/${itemId}`, { method: "PATCH", body, token }),

  removeItem: (itemId: string, token: string) =>
    apiFetch<CartRead>(`/cart/items/${itemId}`, { method: "DELETE", token }),

  clear: (token: string) =>
    apiFetch<CartRead>("/cart", { method: "DELETE", token }),

  quote: (cityId: string, token: string) =>
    apiFetch<CheckoutQuote>(`/checkout/quote?city_id=${cityId}`, { method: "POST", token }),

  place: (body: CheckoutPlace, token: string, idempotencyKey: string) =>
    apiFetch<OrderRead>("/checkout/place", { method: "POST", body, token, idempotencyKey }),

  getOrder: (publicToken: string) =>
    apiFetch<OrderRead>(`/orders/${publicToken}`),

  myOrders: (token: string) =>
    apiFetch<OrderRead[]>("/orders/me", { token }),
};
