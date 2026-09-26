"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { earliestDelivery, formatCountdown } from "@/lib/delivery";
import { fetchListing } from "@/lib/listing";
import { useDeliveryStore, useDeliveryCityName } from "@/stores/delivery.store";
import { ProductCard } from "@/components/catalog/ProductCard";

/**
 * Gifts that can still arrive today in the buyer's city, with an honest
 * countdown to the earliest cutoff. Hidden when no city is chosen or nothing
 * qualifies right now.
 */
export function SameDayRail() {
  const cityId = useDeliveryStore((s) => s.cityId);
  const tz = useDeliveryStore((s) => s.cities.find((c) => c.id === s.cityId)?.timezone) || "Asia/Karachi";
  const cityName = useDeliveryCityName();
  const [items, setItems] = useState<{ product: Product; minutes: number }[]>([]);

  useEffect(() => {
    if (!cityId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    fetchListing({}, { q: "", cityId, sort: "recommended", price: "" }, 1)
      .then((res) => {
        if (cancelled) return;
        const now = new Date();
        const sameDay = res.items.flatMap((product) => {
          const pc = product.product_cities.find((c) => c.city_id === cityId);
          const eta = pc ? earliestDelivery(pc, tz, now) : null;
          return eta?.sameDay && eta.minutesToCutoff !== null ? [{ product, minutes: eta.minutesToCutoff }] : [];
        });
        setItems(sameDay.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cityId, tz]);

  if (!cityId || items.length === 0) return null;
  const soonest = Math.min(...items.map((i) => i.minutes));

  return (
    <section aria-labelledby="same-day-heading" className="px-4 py-12">
      <div className="container mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="same-day-heading" className="text-h2">
              Same-day delivery in {cityName}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-gold-ink">
              <Clock aria-hidden className="h-4 w-4" />
              Order within {formatCountdown(soonest)} for delivery today
            </p>
          </div>
          <Link href={`/search?city_id=${encodeURIComponent(cityId)}`} className="text-sm font-medium text-link hover:underline">
            All gifts for {cityName} <span aria-hidden>→</span>
          </Link>
        </div>
        {/* Swipeable row on phones, grid from sm up. */}
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {items.map(({ product }) => (
            <li key={product.id} className="w-[42vw] max-w-[12rem] shrink-0 snap-start sm:w-auto sm:max-w-none">
              <ProductCard product={product} cityId={cityId} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
