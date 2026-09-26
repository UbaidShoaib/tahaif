import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { directionOf, isLocale } from "@/i18n/config";
import { withFallback } from "@/i18n/messages";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import en from "@/messages/en.json";
import ur from "@/messages/ur.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

type Tree = { [k: string]: string | Tree };
const keys = (t: Tree, p = ""): string[] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [p + k] : keys(v, `${p}${k}.`)));

describe("i18n", () => {
  it("knows which locales are right-to-left", () => {
    expect(directionOf("ur")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
    expect(isLocale("ur")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("has an Urdu string for every English key, and nothing extra", () => {
    expect(keys(ur).sort()).toEqual(keys(en).sort());
  });

  it("keeps ICU placeholders intact in Urdu", () => {
    const placeholders = (s: string) => (s.match(/\{\w+/g) ?? []).sort();
    const flatEn = Object.fromEntries(keys(en).map((k) => [k, k.split(".").reduce<unknown>((o, p) => (o as Tree)[p], en) as string]));
    for (const k of keys(ur)) {
      const u = k.split(".").reduce<unknown>((o, p) => (o as Tree)[p], ur) as string;
      expect(placeholders(u), k).toEqual(placeholders(flatEn[k] as string));
    }
  });

  it("falls back to English for missing keys", () => {
    const merged = withFallback({ cart: { title: "ٹوکری" } }, { cart: { title: "Cart", close: "Close" }, nav: { cakes: "Cakes" } });
    expect(merged).toEqual({ cart: { title: "ٹوکری", close: "Close" }, nav: { cakes: "Cakes" } });
  });

  it("hides the language switcher until Urdu is enabled", () => {
    const { container } = render(<LanguageSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });
});
