import { apiFetch } from "@/lib/api";

export interface LoyaltyWalletRead {
  balance_points: number;
  lifetime_earned: number;
  lifetime_burned: number;
  updated_at: string;
}

export interface LoyaltyLedgerEntry {
  id: string;
  delta_points: number;
  reason: string;
  order_id: string | null;
  created_at: string;
}

export interface ReviewRead {
  id: string;
  user_id: string;
  product_id: string;
  order_item_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_published: boolean;
  created_at: string;
}

export interface ReviewCreate {
  product_id: string;
  order_item_id?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
}

export interface CouponValidateRead {
  code: string;
  coupon_type: "percent" | "fixed" | "free_shipping";
  value: number;
  min_order_pkr: number | null;
  ends_at: string | null;
}

export interface BannerRead {
  id: string;
  slot: string;
  image_url: string;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
  sort_order: number;
}

export interface TestimonialRead {
  id: string;
  name: string;
  body: string;
  rating: number;
  image_url: string | null;
  is_featured: boolean;
}

export const loyaltyApi = {
  getWallet: (token: string) =>
    apiFetch<LoyaltyWalletRead>("/loyalty/me", { token }),

  getLedger: (token: string, limit = 50) =>
    apiFetch<LoyaltyLedgerEntry[]>(`/loyalty/me/ledger?limit=${limit}`, { token }),

  submitReview: (body: ReviewCreate, token: string) =>
    apiFetch<ReviewRead>("/reviews", { method: "POST", body, token }),

  listReviews: (productId: string) =>
    apiFetch<ReviewRead[]>(`/reviews?product_id=${productId}`),

  validateCoupon: (code: string) =>
    apiFetch<CouponValidateRead>(`/coupons/${encodeURIComponent(code)}/validate`),

  listBanners: (slot?: string) =>
    apiFetch<BannerRead[]>(slot ? `/banners?slot=${slot}` : "/banners"),

  listTestimonials: () => apiFetch<TestimonialRead[]>("/testimonials"),
};
