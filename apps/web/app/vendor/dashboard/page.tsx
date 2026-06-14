"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { vendorApi, type VendorRead } from "@/lib/vendor";

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
          className="inline-block bg-[#16a34a] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#15803d] transition-colors"
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
        <Link href="/" className="text-sm text-[#16a34a] hover:underline">
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
          <h1 className="text-2xl font-bold">{vendor.name}</h1>
          {vendor.description && (
            <p className="text-muted-foreground mt-1 text-sm">{vendor.description}</p>
          )}
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            vendor.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {vendor.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/vendor/orders"
          className="border rounded-xl p-6 hover:border-[#16a34a] hover:shadow-sm transition-all group"
        >
          <div className="text-3xl mb-3">📦</div>
          <h2 className="text-lg font-semibold group-hover:text-[#16a34a]">Fulfillments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and update delivery status for your orders.
          </p>
        </Link>

        <Link
          href="/vendor/products"
          className="border rounded-xl p-6 hover:border-[#16a34a] hover:shadow-sm transition-all group"
        >
          <div className="text-3xl mb-3">🛍️</div>
          <h2 className="text-lg font-semibold group-hover:text-[#16a34a]">Products</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Browse the products listed under your store.
          </p>
        </Link>
      </div>
    </div>
  );
}
