"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Gift, LogOut, Menu, User } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuthStore } from "@/stores/auth.store";
import { CurrencySelect } from "@/components/layout/CurrencySelect";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
        aria-label="Open menu"
      >
        <Menu aria-hidden className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="start" title="Menu" closeLabel="Close menu">
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <HeaderSearch onSubmitted={() => setOpen(false)} />
          <DeliveryPicker />

          <nav aria-label="Mobile navigation" className="space-y-6">
            <div>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shop</h3>
              <ul>{NAV_LINKS.map((l) => link(l.href, l.label))}</ul>
            </div>
            <div>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Occasions</h3>
              <ul>{OCCASION_LINKS.map((l) => link(l.href, l.label))}</ul>
            </div>
            <div>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</h3>
              <ul>
                {user ? (
                  <>
                    <li>
                      <Link href="/account" className={itemClass}>
                        <User aria-hidden className="h-4 w-4" /> My account
                      </Link>
                    </li>
                    {link("/account/orders", "My orders")}
                    <li>
                      <button type="button" onClick={() => { void logout(); setOpen(false); }} className={cn(itemClass, "w-full")}>
                        <LogOut aria-hidden className="h-4 w-4" /> Log out
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    {link("/login", "Log in")}
                    {link("/register", "Sign up")}
                  </>
                )}
              </ul>
            </div>
          </nav>

          <div className="space-y-2 px-3">
            <CurrencySelect showLabel />
            <div className="flex items-center justify-between text-sm sm:hidden">
              <span className="text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
        <p className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
          <Gift aria-hidden className="h-4 w-4 text-gold-ink" /> Fresh gifts delivered across Pakistan
        </p>
      </SheetContent>
    </Sheet>
  );
}
