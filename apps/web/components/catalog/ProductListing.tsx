"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { PaginatedProducts, Product } from "@/lib/catalog";
import {
  activeFilterCount,
  fetchListing,
  listingQueryString,
  parseListingParams,
  PRICE_BANDS,
  SORT_OPTIONS,
  type ListingParams,
  type ListingScope,
  type ListingSort,
} from "@/lib/listing";
import { useDeliveryStore } from "@/stores/delivery.store";
import { ProductCard } from "@/components/catalog/ProductCard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { RadioChip, RadioGroup } from "@/components/ui/radio-group";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Props = {
  scope?: ListingScope;
  /** First page, rendered on the server for the URL's filters. Null if the API was down. */
  initial: PaginatedProducts | null;
  /** Show the search box (the /search page). */
  showSearch?: boolean;
  /** Extra sidebar content above the filters, e.g. the category list. */
  aside?: ReactNode;
  emptyTitle?: string;
};

function FilterPanel({
  params,
  onChange,
  cities,
}: {
  params: ListingParams;
  onChange: (next: Partial<ListingParams>) => void;
  cities: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-6">
      {cities.length > 0 && (
        <RadioGroup
          legend="Deliver to"
          value={params.cityId}
          onValueChange={(v) => onChange({ cityId: v })}
          className="flex flex-wrap gap-2"
        >
          <RadioChip value="">Any city</RadioChip>
          {cities.map((c) => (
            <RadioChip key={c.id} value={c.id}>
              {c.name}
            </RadioChip>
          ))}
        </RadioGroup>
      )}
      <RadioGroup
        legend="Price"
        value={params.price}
        onValueChange={(v) => onChange({ price: v })}
        className="flex flex-wrap gap-2"
      >
        <RadioChip value="">Any price</RadioChip>
        {PRICE_BANDS.map((b) => (
          <RadioChip key={b.id} value={b.id}>
            {b.label}
          </RadioChip>
        ))}
      </RadioGroup>
    </div>
  );
}

/**
 * Shared product listing for search, category, occasion and vendor pages.
 * Filters and sort live in the URL (shareable, back-button friendly); the
 * first page comes from the server and "Load more" appends the next pages.
 */
export function ProductListing({ scope = {}, initial, showSearch = false, aside, emptyTitle = "No gifts found" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = parseListingParams(searchParams);
  const queryKey = listingQueryString(params);

  const cities = useDeliveryStore((s) => s.cities);
  const loadCities = useDeliveryStore((s) => s.loadCities);
  const deliverTo = useDeliveryStore((s) => s.cityId);
  const setDeliverTo = useDeliveryStore((s) => s.setCity);

  const [items, setItems] = useState<Product[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(initial === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(initial === null);
  const [searchInput, setSearchInput] = useState(params.q);
  const [retry, setRetry] = useState(0);

  // Key of the results currently shown; the server already fetched the initial ones.
  const fetchedKey = useRef<string | null>(initial ? `${queryKey}#0` : null);
  const firstNewIndex = useRef<number | null>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const scopeKey = JSON.stringify(scope);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  const update = useCallback(
    (next: Partial<ListingParams>) => {
      const merged = { ...parseListingParams(searchParams), ...next };
      if (next.cityId !== undefined) setDeliverTo(next.cityId || null);
      const qs = listingQueryString(merged);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, setDeliverTo],
  );

  // No city in the URL: start from the buyer's "Deliver to" choice.
  useEffect(() => {
    if (!params.cityId && deliverTo) update({ cityId: deliverTo });
    // Only on first mount / when the remembered city first loads.
  }, [deliverTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch page 1 whenever the URL's filters change.
  useEffect(() => {
    const key = `${queryKey}#${retry}`;
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchListing(scope, params, 1)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setPage(1);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, scopeKey, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search box → URL.
  useEffect(() => {
    if (!showSearch || searchInput.trim() === params.q) return;
    const id = setTimeout(() => update({ q: searchInput.trim() }), 300);
    return () => clearTimeout(id);
  }, [searchInput, showSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // After "Load more", move focus to the first new product so keyboard users continue from there.
  useEffect(() => {
    if (firstNewIndex.current === null) return;
    const link = gridRef.current?.querySelectorAll<HTMLAnchorElement>("li > a")[firstNewIndex.current];
    firstNewIndex.current = null;
    link?.focus();
  }, [items]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchListing(scope, params, page + 1);
      firstNewIndex.current = items.length;
      setItems((prev) => [...prev, ...data.items]);
      setTotal(data.total);
      setPage((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const filterCount = activeFilterCount(params);
  const cityName = cities.find((c) => c.id === params.cityId)?.name;
  const band = PRICE_BANDS.find((b) => b.id === params.price);
  const sortOptions = params.q ? SORT_OPTIONS.filter((o) => o.value !== "newest") : SORT_OPTIONS;
  const hasMore = items.length < total;
  const summary = loading
    ? "Loading gifts…"
    : `${total} ${total === 1 ? "gift" : "gifts"}${params.q ? ` for “${params.q}”` : ""}${cityName ? ` delivered in ${cityName}` : ""}`;

  return (
    <div className="flex gap-8">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 space-y-8 lg:block" aria-label="Filters">
        {aside}
        <FilterPanel params={params} onChange={update} cities={cities} />
      </aside>

      <section aria-label="Results" className="min-w-0 flex-1 space-y-4">
        {showSearch && (
          <div role="search" className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search gifts"
              placeholder="Search cakes, flowers, perfumes…"
              enterKeyHint="search"
              className="h-12 w-full rounded-full border border-input bg-background pe-4 ps-11 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <p aria-live="polite" className="me-auto text-sm text-muted-foreground">
            {summary}
          </p>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-11 gap-2 lg:hidden">
                <SlidersHorizontal aria-hidden className="h-4 w-4" />
                Filters
                {filterCount > 0 && <Badge variant="solid">{filterCount}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" title="Filters" closeLabel="Close filters">
              <div className="overflow-y-auto px-4 py-4">
                <FilterPanel params={params} onChange={update} cities={cities} />
              </div>
              <div className="flex gap-2 border-t px-4 py-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={filterCount === 0}
                  onClick={() => update({ cityId: "", price: "" })}
                >
                  Clear all
                </Button>
                <SheetClose asChild>
                  <Button className="flex-1">{loading ? "Show gifts" : `Show ${total} ${total === 1 ? "gift" : "gifts"}`}</Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>

          <label className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap text-muted-foreground">Sort by</span>
            <Select
              value={params.sort}
              onChange={(e) => update({ sort: e.target.value as ListingSort })}
              className="h-11 w-auto sm:text-sm"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {/* Active filters */}
        {filterCount > 0 && (
          <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
            {cityName && (
              <li>
                <button
                  type="button"
                  onClick={() => update({ cityId: "" })}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-soft px-3 text-sm font-medium text-primary-soft-foreground hover:bg-primary-soft/70"
                  aria-label={`Remove filter: delivered in ${cityName}`}
                >
                  {cityName}
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </li>
            )}
            {band && (
              <li>
                <button
                  type="button"
                  onClick={() => update({ price: "" })}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-soft px-3 text-sm font-medium text-primary-soft-foreground hover:bg-primary-soft/70"
                  aria-label={`Remove filter: ${band.label}`}
                >
                  {band.label}
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => update({ cityId: "", price: "" })}
                className="min-h-9 rounded-md px-2 text-sm font-medium text-link hover:underline"
              >
                Clear all
              </button>
            </li>
          </ul>
        )}

        {/* Results */}
        {error && items.length === 0 ? (
          <EmptyState
            title="We couldn't load gifts right now"
            description="Please check your connection and try again."
            action={
              <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </Button>
            }
          />
        ) : loading && items.length === 0 ? (
          <ul aria-busy="true" aria-label="Loading gifts" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <ProductCardSkeleton />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            description={
              filterCount > 0 || params.q
                ? "Try a different search, another city or a wider price range."
                : "New gifts are added regularly — check back soon."
            }
            action={
              filterCount > 0 ? (
                <Button variant="outline" onClick={() => update({ cityId: "", price: "" })}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul
              ref={gridRef}
              aria-busy={loading || undefined}
              className={cn("grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 xl:grid-cols-4", loading && "opacity-60")}
            >
              {items.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} cityId={params.cityId || undefined} />
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-center gap-2 pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {items.length} of {total}
              </p>
              {hasMore && (
                <Button variant="outline" size="lg" loading={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "Loading…" : "Load more gifts"}
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
