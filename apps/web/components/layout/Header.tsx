"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ShoppingBag, Gift, User, LogOut } from "lucide-react";

export function Header() {
  const { user, logout } = useAuthStore();
  const { cart, fetchCart, openDrawer } = useCartStore();

  useEffect(() => {
    if (user) void fetchCart();
  }, [user, fetchCart]);

  const itemCount = cart?.item_count ?? 0;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary-600">
            <Gift className="h-6 w-6" />
            <span>تحائف Tahaif</span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/c/cakes" className="hover:text-primary-600 transition-colors">Cakes</Link>
            <Link href="/c/flowers" className="hover:text-primary-600 transition-colors">Flowers</Link>
            <Link href="/c/chocolates" className="hover:text-primary-600 transition-colors">Chocolates</Link>
            <Link href="/c/perfumes" className="hover:text-primary-600 transition-colors">Perfumes</Link>
            <Link href="/search" className="hover:text-primary-600 transition-colors">All Gifts</Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {/* Cart button with badge */}
            <button
              onClick={openDrawer}
              className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors"
              aria-label={`Cart (${itemCount} items)`}
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white leading-none">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-1">
                <Link href="/account">
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => { void logout(); }} aria-label="Log out">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">Log in</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Sign up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <CartDrawer />
    </>
  );
}
