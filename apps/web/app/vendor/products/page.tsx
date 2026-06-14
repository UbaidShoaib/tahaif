"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { vendorApi, type VendorProductRead } from "@/lib/vendor";

function formatPKR(paisa: number) {
  return `PKR ${(paisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 0 })}`;
}

export default function VendorProductsPage() {
  const { accessToken, isLoading: authLoading } = useAuthStore();
  const [products, setProducts] = useState<VendorProductRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    vendorApi
      .listProducts(accessToken)
      .then(setProducts)
      .catch(() => setError("Failed to load products."))
      .finally(() => setLoading(false));
  }, [accessToken, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Loading products…</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-6">Please sign in to view your products.</p>
        <Link href="/login" className="text-sm text-[#16a34a] hover:underline">
          Sign In
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Products</h1>
        <Link href="/vendor/dashboard" className="text-sm text-[#16a34a] hover:underline">
          ← Dashboard
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">
          No products found. Contact support to add products to your store.
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="border rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:border-[#16a34a] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{p.name}</p>
                  {!p.is_active && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full shrink-0">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  From {formatPKR(p.base_price_pkr)}
                </p>
              </div>
              <Link
                href={`/p/${p.slug}`}
                target="_blank"
                className="shrink-0 text-sm text-[#16a34a] hover:underline"
              >
                View →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
