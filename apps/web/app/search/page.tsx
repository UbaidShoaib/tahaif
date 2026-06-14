"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { City, Product } from "@/lib/catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const initialCity = searchParams.get("city_id") ?? "";

  const [query, setQuery] = useState(initialQ);
  const [cityId, setCityId] = useState(initialCity);
  const [cities, setCities] = useState<City[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/cities`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: City[]) => setCities(data))
      .catch(() => {});
  }, []);

  const fetchProducts = useCallback(async (q: string, city: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page_size: "48" });
      if (city) qs.set("city_id", city);
      const res = await fetch(`${API_BASE}/products?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { items: Product[]; total: number };

      const filtered = q.trim()
        ? data.items.filter(
            (p) =>
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

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchProducts(query, cityId);
      const qs = new URLSearchParams();
      if (query.trim()) qs.set("q", query);
      if (cityId) qs.set("city_id", cityId);
      const qstr = qs.toString();
      router.replace(qstr ? `/search?${qstr}` : "/search", { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [query, cityId, fetchProducts, router]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search bar */}
      <div className="max-w-2xl mx-auto mb-10 space-y-3">
        <h1 className="text-3xl font-bold text-center mb-6">Find the perfect gift</h1>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cakes, flowers, perfumes…"
            className="pl-10 h-12 text-base"
            autoFocus
          />
        </div>

        {/* City filter */}
        {cities.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground shrink-0">Deliver to:</span>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCityId("")}
                className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                  !cityId
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-border hover:border-primary-400 text-foreground"
                }`}
              >
                All cities
              </button>
              {cities.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCityId(c.id)}
                  className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                    cityId === c.id
                      ? "bg-primary-600 text-white border-primary-600"
                      : "border-border hover:border-primary-400 text-foreground"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
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
            {(query || cityId) && (
              <p className="text-sm text-muted-foreground mb-4">
                {total} result{total !== 1 ? "s" : ""}
                {query ? ` for "${query}"` : ""}
                {cityId
                  ? ` in ${cities.find((c) => c.id === cityId)?.name ?? "selected city"}`
                  : ""}
              </p>
            )}
            <ProductGrid
              products={products}
              cityId={cityId || undefined}
              emptyMessage={
                query || cityId
                  ? "No results found. Try a different search or city."
                  : "No products available."
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
