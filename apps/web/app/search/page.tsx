"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { Product } from "@/lib/catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQ);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchProducts = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page_size: "48" });
      const res = await fetch(`${API_BASE}/products?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { items: Product[]; total: number };

      // Client-side name filter when no Meilisearch
      const filtered = q.trim()
        ? data.items.filter((p) =>
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            (p.description ?? "").toLowerCase().includes(q.toLowerCase()) ||
            (p.vendor?.name ?? "").toLowerCase().includes(q.toLowerCase()),
          )
        : data.items;

      setProducts(filtered);
      setTotal(filtered.length);
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce
  useEffect(() => {
    const id = setTimeout(() => {
      void fetchProducts(query);
      const url = query.trim() ? `/search?q=${encodeURIComponent(query)}` : "/search";
      router.replace(url, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [query, fetchProducts, router]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search bar */}
      <div className="max-w-xl mx-auto mb-10">
        <h1 className="text-3xl font-bold text-center mb-6">Find the perfect gift</h1>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground pointer-events-none h-5 w-5" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cakes, flowers, perfumes…"
            className="pl-10 h-12 text-base"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-muted animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <>
            {query && (
              <p className="text-sm text-muted-foreground mb-4">
                {total} result{total !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
              </p>
            )}
            <ProductGrid
              products={products}
              emptyMessage={
                query ? `No results for "${query}". Try a different search.` : "No products available."
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
