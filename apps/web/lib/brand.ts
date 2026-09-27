/**
 * White-label brand config. Every customer-facing name, logo and URL comes from here,
 * so a new storefront is an env change, not a code change (ADR 0006).
 *
 * NEXT_PUBLIC_* values are inlined at build time; set them per deployment.
 */
export interface Brand {
  /** Display name, e.g. "Tahaif". */
  name: string;
  /** Optional second-script name shown before `name` in the header, e.g. "تحائف". */
  localName: string;
  /** Logo image URL or /public path. Empty → the default gift icon is used. */
  logoUrl: string;
  /** Short product pitch used in the <title> and meta description. */
  tagline: string;
  siteUrl: string;
  /** Bank-transfer payee shown at checkout. */
  bankAccountName: string;
}

function env(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

const name = env(process.env.NEXT_PUBLIC_BRAND_NAME, "GiftShop");

export const brand: Brand = {
  name,
  localName: env(process.env.NEXT_PUBLIC_BRAND_LOCAL_NAME, ""),
  logoUrl: env(process.env.NEXT_PUBLIC_BRAND_LOGO_URL, ""),
  tagline: env(process.env.NEXT_PUBLIC_BRAND_TAGLINE, "Send Gifts Across Pakistan"),
  siteUrl: env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000"),
  bankAccountName: env(process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME, `${name} — Bank Account`),
};

/** File-name-safe slug of the brand name, e.g. for downloads. */
export function brandSlug(b: Pick<Brand, "name"> = brand): string {
  return b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
}
