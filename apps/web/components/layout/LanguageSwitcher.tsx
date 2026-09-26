"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_COOKIE, URDU_ENABLED } from "@/i18n/config";
import { Select } from "@/components/ui/select";

const NAMES: Record<string, string> = { en: "English", ur: "اردو" };

/** English / اردو. Hidden until Urdu is enabled (NEXT_PUBLIC_ENABLE_URDU). */
export function LanguageSwitcher() {
  const t = useTranslations("menu");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  if (!URDU_ENABLED) return null;

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        {t("language")}
      </label>
      <Select
        id={id}
        value={locale}
        className="h-11 w-auto"
        onChange={(e) => {
          document.cookie = `${LOCALE_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {Object.entries(NAMES).map(([code, name]) => (
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </Select>
    </div>
  );
}
