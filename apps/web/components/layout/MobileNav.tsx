"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Gift, LogOut, Menu, User } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuthStore } from "@/stores/auth.store";
import { CurrencySelect } from "@/components/layout/CurrencySelect";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { DeliveryPicker } from "@/components/layout/DeliveryPicker";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { NAV_LINKS, OCCASION_LINKS } from "@/components/layout/nav-links";
import { cn } from "@/lib/utils";

const itemClass = "flex min-h-11 items-center gap-2 rounded-md px-3 font-medium hover:bg-muted";

/** Slide-in menu for phones and tablets (start side, so it flips in RTL). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const t = useTranslations();

  // Close after navigating.
  useEffect(() => setOpen(false), [pathname]);

  const link = (href: string, label: string) => (
    <li key={href}>
      <Link
        href={href}
        aria-current={pathname === href ? "page" : undefined}
        className={cn(itemClass, pathname === href && "bg-primary-soft text-primary-soft-foreground")}
      >
        {label}
      </Link>
    </li>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-muted lg:hidden"
        aria-label={t("menu.open")}
      >
        <Menu aria-hidden className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="start" title={t("menu.title")} closeLabel={t("menu.close")}>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <HeaderSearch onSubmitted={() => setOpen(false)} />
          <DeliveryPicker />

          <nav aria-label={t("menu.mobileNav")} className="space-y-6">
            <div>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("menu.shop")}</h3>
              <ul>{NAV_LINKS.map((l) => link(l.href, t(`nav.${l.key}`)))}</ul>
            </div>
            <div>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("menu.occasions")}</h3>
              <ul>{OCCASION_LINKS.map((l) => link(l.href, t(`nav.${l.key}`)))}</ul>
            </div>
            <div>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("menu.account")}</h3>
              <ul>
                {user ? (
                  <>
                    <li>
                      <Link href="/account" className={itemClass}>
                        <User aria-hidden className="h-4 w-4" /> {t("menu.myAccount")}
                      </Link>
                    </li>
                    {link("/account/orders", t("menu.myOrders"))}
                    <li>
                      <button type="button" onClick={() => { void logout(); setOpen(false); }} className={cn(itemClass, "w-full")}>
                        <LogOut aria-hidden className="h-4 w-4" /> {t("header.logOut")}
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    {link("/login", t("header.logIn"))}
                    {link("/register", t("header.signUp"))}
                  </>
                )}
              </ul>
            </div>
          </nav>

          <div className="space-y-2 px-3">
            <CurrencySelect showLabel />
            <LanguageSwitcher />
            <div className="flex items-center justify-between text-sm sm:hidden">
              <span className="text-muted-foreground">{t("menu.theme")}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
        <p className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
          <Gift aria-hidden className="h-4 w-4 text-gold-ink" /> {t("menu.tagline")}
        </p>
      </SheetContent>
    </Sheet>
  );
}
