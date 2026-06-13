import Link from "next/link";
import { Gift } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary-600">
              <Gift className="h-5 w-5" />
              <span>Tahaif</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              Send gifts to your loved ones across Pakistan. Cakes, flowers, perfumes and more.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Shop</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/c/cakes" className="hover:text-foreground transition-colors">Cakes</Link></li>
              <li><Link href="/c/flowers" className="hover:text-foreground transition-colors">Flowers</Link></li>
              <li><Link href="/c/chocolates" className="hover:text-foreground transition-colors">Chocolates</Link></li>
              <li><Link href="/c/perfumes" className="hover:text-foreground transition-colors">Perfumes</Link></li>
              <li><Link href="/search" className="hover:text-foreground transition-colors">All Gifts</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Account</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/login" className="hover:text-foreground transition-colors">Login</Link></li>
              <li><Link href="/register" className="hover:text-foreground transition-colors">Register</Link></li>
              <li><Link href="/account/orders" className="hover:text-foreground transition-colors">My Orders</Link></li>
              <li><Link href="/account/addresses" className="hover:text-foreground transition-colors">Addresses</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Help</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link></li>
              <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link href="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link></li>
            </ul>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Tahaif. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>🔒 SSL Secure</span>
            <span>🚚 On-time delivery</span>
            <span>💚 Money-back guarantee</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
