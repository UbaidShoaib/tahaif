/** Admin API for coupons, occasions, shops, users and exchange rates. */
import { apiFetch } from "@/lib/api";
import { cityTimeToInstant, PAKISTAN_TZ } from "@/lib/datetime";

export type CouponType = "percent" | "fixed" | "free_shipping";

export type Coupon = {
  id: string;
  code: string;
  coupon_type: CouponType;
  value: string;
  min_order_pkr: number | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

export type CouponWrite = {
  value: string;
  min_order_pkr: number | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type AdminOccasion = {
  id: string;
  slug: string;
  name: string;
  name_ur: string | null;
  banner_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
};

export type OccasionWrite = Pick<AdminOccasion, "name" | "name_ur" | "banner_url" | "starts_at" | "ends_at" | "sort_order">;

export type AdminShop = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  contact_phone: string | null;
  city_id: string;
  city_name: string;
  is_active: boolean;
  is_house: boolean;
  owner_email: string | null;
  product_count: number;
  live_product_count: number;
  bank_account_title: string | null;
  bank_name: string | null;
  bank_iban: string | null;
};

export type Role = "customer" | "vendor" | "staff" | "admin";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  is_verified: boolean;
  created_at: string;
};

export type FxRate = { id: string; quote_currency: string; rate: string; source: "auto" | "manual"; fetched_at: string };
export type FxCurrency = { quote_currency: string; auto: FxRate | null; manual: FxRate | null; effective_rate: string | null };

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  return p.size ? `?${p.toString()}` : "";
};

export const couponsApi = {
  list: (token: string, q?: string) => apiFetch<Coupon[]>(`/admin/coupons${qs({ q })}`, { token }),
  create: (token: string, body: CouponWrite & { code: string; coupon_type: CouponType }) =>
    apiFetch<Coupon>("/admin/coupons", { method: "POST", token, body }),
  update: (token: string, id: string, body: Partial<CouponWrite>) =>
    apiFetch<Coupon>(`/admin/coupons/${id}`, { method: "PATCH", token, body }),
  setActive: (token: string, id: string, is_active: boolean) =>
    apiFetch<Coupon>(`/admin/coupons/${id}/active`, { method: "PATCH", token, body: { is_active } }),
};

export const occasionsApi = {
  list: (token: string) => apiFetch<AdminOccasion[]>("/admin/occasions", { token }),
  create: (token: string, body: OccasionWrite & { slug: string }) =>
    apiFetch<AdminOccasion>("/admin/occasions", { method: "POST", token, body }),
  update: (token: string, id: string, body: Partial<OccasionWrite & { is_active: boolean }>) =>
    apiFetch<AdminOccasion>(`/admin/occasions/${id}`, { method: "PATCH", token, body }),
};

export type ShopWrite = Partial<Pick<AdminShop, "name" | "description" | "logo_url" | "contact_phone" | "city_id" | "is_active">>;

export const shopsApi = {
  list: (token: string, q?: string) => apiFetch<AdminShop[]>(`/admin/vendors${qs({ q })}`, { token }),
  create: (token: string, body: { name: string; slug: string; city_id: string; description: string | null }) =>
    apiFetch<{ id: string }>("/vendors", { method: "POST", token, body }),
  update: (token: string, id: string, body: ShopWrite) =>
    apiFetch<AdminShop>(`/admin/vendors/${id}`, { method: "PATCH", token, body }),
};

export const usersApi = {
  list: (token: string, q?: string, role?: Role) => apiFetch<AdminUser[]>(`/admin/users${qs({ q, role })}`, { token }),
  setRole: (token: string, id: string, role: Role) =>
    apiFetch<AdminUser>(`/admin/users/${id}/role?role=${role}`, { method: "PATCH", token }),
};

export const fxApi = {
  list: (token: string) => apiFetch<FxCurrency[]>("/admin/fx-rates", { token }),
  override: (token: string, quote_currency: string, rate: string) =>
    apiFetch<FxRate>("/admin/fx-rates/override", { method: "POST", token, body: { quote_currency, rate } }),
  clear: (token: string, quote_currency: string) =>
    apiFetch<void>(`/admin/fx-rates/override/${quote_currency}`, { method: "DELETE", token }),
};

/** A date box's day as an instant in Pakistan time: the start of the day, or its last minute for an end date. */
export function dayToInstant(day: string, end = false): string | null {
  if (!day) return null;
  return cityTimeToInstant(day, end ? "23:59" : "00:00", PAKISTAN_TZ).toISOString();
}

/** The Pakistan calendar day of an instant, for a date box ("" when there is none). */
export function instantToDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: PAKISTAN_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

/** Blank → null; otherwise a whole number at least `min`, or undefined when it isn't one. */
export function optionalWhole(text: string, min = 0): number | null | undefined {
  if (!text.trim()) return null;
  if (!/^\d+$/.test(text.trim())) return undefined;
  const n = Number(text.trim());
  return n >= min ? n : undefined;
}

export function couponSummary(c: Pick<Coupon, "coupon_type" | "value">): string {
  const amount = Number(c.value);
  if (c.coupon_type === "percent") return `${amount}% off`;
  if (c.coupon_type === "fixed") return `Rs ${amount.toLocaleString("en-PK")} off`;
  return "Free delivery";
}
