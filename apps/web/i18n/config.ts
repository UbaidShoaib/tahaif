/** Locales (ADR 0005). The locale lives in a cookie, so URLs don't change. */
export const LOCALES = ["en", "ur"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";
const RTL: ReadonlySet<Locale> = new Set(["ur"]);

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return RTL.has(locale) ? "rtl" : "ltr";
}

/** Urdu is behind a flag until the whole storefront is translated and reviewed. */
export const URDU_ENABLED = process.env.NEXT_PUBLIC_ENABLE_URDU === "true";
