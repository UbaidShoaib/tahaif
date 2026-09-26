"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CurrencySelect } from "@/components/layout/CurrencySelect";
import { ShoppingBag, Gift, User, LogOut, Search, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/c/cakes", label: "Cakes" },
  { href: "/c/flowers", label: "Flowers" },
  { href: "/c/chocolates", label: "Chocolates" },
  { href: "/c/perfumes", label: "Perfumes" },
  { href: "/search", label: "All Gifts" },
];

export function Header() {
  const { user, logout } = useAuthStore();
  const { cart, fetchCart, openDrawer } = useCartStore();

  useEffect(() => {
    if (user) void fetchCart();
  }, [user, fetchCart]);

  const itemCount = cart?.item_count ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted transition-colors md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-link">
            <Gift className="h-6 w-6" />
            <span>تحائف Tahaif</span>
          </Link>

          {/* Nav */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className="hover:text-link transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/search"
              aria-label="Search gifts"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted transition-colors"
            >
              <Search className="h-5 w-5" aria-hidden />
            </Link>
            <div className="hidden sm:block">
              <CurrencySelect />
            </div>
            <ThemeToggle />

            {/* Cart button with badge */}
            <button
              onClick={openDrawer}
              className="relative inline-flex items-center justify-center h-11 w-11 rounded-md hover:bg-muted transition-colors"
              aria-label={`Cart (${itemCount} items)`}
            >
              <ShoppingBag className="h-5 w-5" aria-hidden />
              {itemCount > 0 && (
                <span aria-hidden className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-700 px-1 text-xs font-bold text-white leading-none">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-11 w-11" asChild>
                  <Link href="/account" aria-label="Account">
                    <User className="h-5 w-5" aria-hidden />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="hidden h-11 w-11 sm:inline-flex" onClick={() => { void logout(); }} aria-label="Log out">
                  <LogOut className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu (stopgap until the Sheet-based MobileNav) */}
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Mobile navigation" className="border-t bg-background md:hidden">
            <ul className="container mx-auto flex flex-col px-4 py-2">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={pathname === l.href ? "page" : undefined}
                    className="flex min-h-11 items-center rounded-md px-2 font-medium hover:bg-muted"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li className="my-2 border-t" aria-hidden />
              {user ? (
                <li>
                  <button
                    type="button"
                    onClick={() => { void logout(); }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 font-medium hover:bg-muted"
                  >
                    <LogOut className="h-4 w-4" aria-hidden /> Log out
                  </button>
                </li>
              ) : (
                <>
                  <li><Link href="/login" className="flex min-h-11 items-center rounded-md px-2 font-medium hover:bg-muted">Log in</Link></li>
                  <li><Link href="/register" className="flex min-h-11 items-center rounded-md px-2 font-medium hover:bg-muted">Sign up</Link></li>
                </>
              )}
              <li className="flex items-center px-2 empty:hidden">
                <CurrencySelect showLabel />
              </li>
            </ul>
          </nav>
        )}
      </header>

      <CartDrawer />
    </>
  );
}
