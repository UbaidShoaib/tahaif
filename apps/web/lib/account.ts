import { apiFetch } from "@/lib/api";
import type { UserRead } from "@/stores/auth.store";
import type { MonthDay } from "@/lib/occasions";

export const SUPPORTED_CURRENCIES = ["PKR", "USD", "GBP", "EUR", "CAD", "AUD", "AED", "SAR"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export interface UserUpdate {
  full_name?: string | null;
  currency_pref?: CurrencyCode;
  country?: string;
  occasion_reminders?: boolean;
}

/** Where diaspora buyers live; drives Mother's Day reminder dates. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "MY", name: "Malaysia" },
  { code: "PK", name: "Pakistan" },
];

export interface AddressRead {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  line1: string;
  line2: string | null;
  city_name: string;
  landmark: string | null;
  alt_phone: string | null;
  is_default: boolean;
  /** Who they are to the buyer, e.g. "Ammi". */
  relationship?: string | null;
  birthday?: MonthDay | null;
  anniversary?: MonthDay | null;
}

export interface AddressWrite {
  recipient_name: string;
  recipient_phone: string;
  line1: string;
  line2?: string | null;
  city_name: string;
  landmark?: string | null;
  alt_phone?: string | null;
  is_default?: boolean;
  relationship?: string | null;
  /** null clears it. */
  birthday?: MonthDay | null;
  anniversary?: MonthDay | null;
}

export interface FxRates {
  base: "PKR";
  /** PKR→currency rates as decimal strings. PKR is always present. */
  rates: Record<string, string>;
}

export const accountApi = {
  getMe: (token: string) => apiFetch<UserRead>("/me", { token }),
  updateMe: (body: UserUpdate, token: string) => apiFetch<UserRead>("/me", { method: "PATCH", body, token }),
  exportData: (token: string) => apiFetch<Record<string, unknown>>("/me/export", { token }),
  deleteAccount: (token: string) => apiFetch<void>("/me", { method: "DELETE", token }),

  listAddresses: (token: string) => apiFetch<AddressRead[]>("/me/addresses", { token }),
  createAddress: (body: AddressWrite, token: string) =>
    apiFetch<AddressRead>("/me/addresses", { method: "POST", body, token }),
  updateAddress: (id: string, body: Partial<AddressWrite>, token: string) =>
    apiFetch<AddressRead>(`/me/addresses/${id}`, { method: "PATCH", body, token }),
  deleteAddress: (id: string, token: string) =>
    apiFetch<void>(`/me/addresses/${id}`, { method: "DELETE", token }),

  fxRates: () => apiFetch<FxRates>("/fx-rates"),
};
