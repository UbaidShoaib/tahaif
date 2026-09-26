/**
 * Vitest: components that call useTranslations/useLocale render with the real
 * English messages, without wrapping every test in NextIntlClientProvider.
 */
import { vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => "en",
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
  };
});
