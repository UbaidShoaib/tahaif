import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, URDU_ENABLED } from "@/i18n/config";
import { withFallback } from "@/i18n/messages";
import en from "@/messages/en.json";

export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = URDU_ENABLED && isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  const messages =
    locale === DEFAULT_LOCALE ? en : withFallback((await import(`../messages/${locale}.json`)).default, en);
  return { locale, messages };
});
