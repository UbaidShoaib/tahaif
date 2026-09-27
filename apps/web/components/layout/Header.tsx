"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CurrencySelect } from "@/components/layout/CurrencySelect";
import { DeliveryPicker } from "@/components/layout/DeliveryPicker";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { MobileNav } from "@/components/layout/MobileNav";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NAV_LINKS } from "@/components/layout/nav-links";
import { ShoppingBag, User, LogOut, Search } from "lucide-react";

export function Header() {
  const { user, logout } = useAuthStore();
  const { cart, fetchCart, openDrawer } = useCartStore();

  // Load the cart for guests too (ADR 0004). When a guest signs in, the next fetch
  // sends both credentials and the API merges the guest cart into theirs.
  useEffect(() => {
    void fetchCart();
  }, [user, fetchCart]);

  const itemCount = cart?.item_count ?? 0;
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <>
      <header className="sticky top-0 z-50 w-full print:hidden border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 shrink items-center gap-1">
            <MobileNav />

            {/* Logo — the icon and Urdu name drop on very narrow phones so the cart stays on screen. */}
            <Link href="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap text-lg font-bold text-link xs:text-xl">
              <BrandLogo markClassName="hidden h-6 w-6 xs:block" showLocalName />
            </Link>
          </div>

          {/* Nav */}
          <nav aria-label={t("nav.main")} className="hidden lg:flex items-center gap-5 whitespace-nowrap text-sm font-medium">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className="hover:text-link transition-colors"
              >
                {t(`nav.${l.key}`)}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1 sm:gap-2">
            <HeaderSearch className="hidden w-44 lg:block xl:w-56" />
            <DeliveryPicker compact className="hidden xl:flex" />
            <Link
              href="/search"
              aria-label={t("header.searchGifts")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted transition-colors lg:hidden"
            >
              <Search className="h-5 w-5" aria-hidden />
            </Link>
            <div className="hidden sm:block">
              <CurrencySelect />
            </div>
            {/* On phones the theme switch lives in the menu to keep the header on one line. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>

            {/* Cart button with badge */}
            <button
              onClick={openDrawer}
              className="relative inline-flex items-center justify-center h-11 w-11 rounded-md hover:bg-muted transition-colors"
              aria-label={t("header.cart", { count: itemCount })}
            >
              <ShoppingBag className="h-5 w-5" aria-hidden />
              {itemCount > 0 && (
                <span aria-hidden className="absolute end-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-700 px-1 text-xs font-bold text-white leading-none">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-11 w-11" asChild>
                  <Link href="/account" aria-label={t("header.account")}>
                    <User className="h-5 w-5" aria-hidden />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="hidden h-11 w-11 sm:inline-flex" onClick={() => { void logout(); }} aria-label={t("header.logOut")}>
                  <LogOut className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">{t("header.logIn")}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">{t("header.signUp")}</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

      </header>

      <CartDrawer />
    </>
  );
}
