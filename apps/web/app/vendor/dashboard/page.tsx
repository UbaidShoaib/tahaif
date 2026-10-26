"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { vendorApi, type VendorRead } from "@/lib/vendor";
import { TodayQueue } from "@/components/vendor/TodayQueue";

export default function VendorDashboardPage() {
  const { accessToken, isLoading: authLoading } = useAuthStore();
  const [vendor, setVendor] = useState<VendorRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    vendorApi
      .getMe(accessToken)
      .then(setVendor)
      .catch(() => setError("Could not load vendor profile. Make sure you have a vendor account."))
      .finally(() => setLoading(false));
  }, [accessToken, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Loading vendor dashboard…</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Vendor Portal</h1>
        <p className="text-muted-foreground mb-6">Please sign in to access your vendor dashboard.</p>
        <Link
          href="/login"
          className="inline-block bg-primary-700 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-800 transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Vendor Portal</h1>
        <p className="text-destructive mb-4">{error}</p>
        <Link href="/" className="text-sm text-link hover:underline">
          Return to store
        </Link>
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground">{vendor.name}</p>
          <h1 className="font-display text-h2">Today</h1>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            vendor.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {vendor.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <TodayQueue token={accessToken} />

      <nav aria-label="Vendor portal" className="mt-10 flex flex-wrap gap-3 border-t pt-6 text-sm font-medium">
        <Link href="/vendor/orders" className="text-link hover:underline">
          All orders
        </Link>
        <Link href="/vendor/products" className="text-link hover:underline">
          Products
        </Link>
      </nav>
    </div>
  );
}
