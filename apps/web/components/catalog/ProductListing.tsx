"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import type { City, PaginatedProducts, Product } from "@/lib/catalog";
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
import { addDays, formatDeliveryDay, zonedNow } from "@/lib/delivery";
import { useDeliveryStore } from "@/stores/delivery.store";
import { ProductCard } from "@/components/catalog/ProductCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  scope?: ListingScope;
  /** First page, rendered on the server for the URL's filters. Null if the API was down. */
  initial: PaginatedProducts | null;
  /** Show the search box (the /search page). */
  showSearch?: boolean;
  emptyTitle?: string;
  /** A city page (/city/x, /c/y/x): the city comes from the path, not ?city_id=, and can't be changed here. */
  city?: City;
};

const chipBase =
  "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chipOff = "border-input bg-background text-foreground hover:border-primary-700";
const chipOn = "border-primary-700 bg-primary-soft text-primary-soft-foreground";

/** A filter shown as a pill that opens a native select: one tap target, real keyboard and screen-reader support. */
function ChipSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={cn(chipBase, "relative pe-8", value ? chipOn : chipOff)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent font-medium focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-3 h-4 w-4" />
    </label>
  );
}

/**
 * Shared product listing for search, category, occasion and vendor pages: one
 * row of filter chips above a full-width grid, the same on every screen size,
 * with "Arrives tomorrow" always first. Filters and sort live in the URL (shareable, back-button friendly); the
 * first page comes from the server and "Load more" appends the next pages.
 */
export function ProductListing({ scope = {}, initial, showSearch = false, emptyTitle = "No gifts found", city }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlParams = parseListingParams(searchParams);
  const params = city ? { ...urlParams, cityId: city.id } : urlParams;
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
      if (city) merged.cityId = "";
      else if (next.cityId !== undefined) setDeliverTo(next.cityId || null);
      const qs = listingQueryString(merged);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [city, pathname, router, searchParams, setDeliverTo],
  );

  // No city in the URL: start from the buyer's "Deliver to" choice.
  useEffect(() => {
    if (!city && !params.cityId && deliverTo) update({ cityId: deliverTo });
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

  // A city page's own city isn't a filter the buyer can clear.
  const filterCount = activeFilterCount(params) - (city ? 1 : 0);
  const chosenCity = city ?? cities.find((c) => c.id === params.cityId);
  const cityName = chosenCity?.name;
  const tz = chosenCity?.timezone ?? "Asia/Karachi";
  const today = zonedNow(tz).date;
  const tomorrow = addDays(today, 1);
  // A date only filters once a city is chosen; the chip says which day it means.
  const dateOn = Boolean(params.on && params.cityId);
  const day = dateOn ? formatDeliveryDay(params.on, tz) : "Tomorrow";
  const dateLabel = `Arrives ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day}`;
  const sortOptions = params.q ? SORT_OPTIONS.filter((o) => o.value !== "newest") : SORT_OPTIONS;
  const hasMore = items.length < total;
  const summary = loading
    ? "Loading gifts…"
    : `${total} ${total === 1 ? "gift" : "gifts"}${params.q ? ` for “${params.q}”` : ""}${cityName ? ` delivered in ${cityName}` : ""}`;

  return (
    <div>
      <section aria-label="Results" className="space-y-4">
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

        {/* Filter chips: one row, scrolling sideways on a phone */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <button
            type="button"
            aria-pressed={dateOn}
            disabled={!params.cityId}
            title={params.cityId ? undefined : "Choose a city first"}
            onClick={() => update({ on: dateOn ? "" : tomorrow })}
            className={cn(chipBase, dateOn ? chipOn : chipOff, "disabled:cursor-not-allowed disabled:opacity-50")}
          >
            {dateOn && <Check aria-hidden className="h-4 w-4" />}
            {dateLabel}
          </button>
          {!city && cities.length > 0 && (
            <ChipSelect
              label="Deliver to"
              value={params.cityId}
              onChange={(v) => update({ cityId: v })}
              options={[{ value: "", label: "Any city" }, ...cities.map((c) => ({ value: c.id, label: c.name }))]}
            />
          )}
          <ChipSelect
            label="Price"
            value={params.price}
            onChange={(v) => update({ price: v })}
            options={[{ value: "", label: "Any price" }, ...PRICE_BANDS.map((b) => ({ value: b.id, label: b.label }))]}
          />
          <ChipSelect
            label="Sort by"
            value={params.sort === "recommended" ? "" : params.sort}
            onChange={(v) => update({ sort: (v || "recommended") as ListingSort })}
            options={sortOptions.map((o) => ({ value: o.value === "recommended" ? "" : o.value, label: o.label }))}
          />
          {filterCount > 0 && (
            <button
              type="button"
              onClick={() => update({ cityId: "", price: "", on: "" })}
              className="min-h-10 shrink-0 rounded-md px-2 text-sm font-medium text-link hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <p aria-live="polite" className="text-sm text-muted-foreground">
          {summary}
        </p>

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
          <ul aria-busy="true" aria-label="Loading gifts" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                ? "Try a different search, another city, a later day or a wider price range."
                : "New gifts are added regularly — check back soon."
            }
            action={
              filterCount > 0 ? (
                <Button variant="outline" onClick={() => update({ cityId: "", price: "", on: "" })}>
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
              className={cn("grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", loading && "opacity-60")}
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
