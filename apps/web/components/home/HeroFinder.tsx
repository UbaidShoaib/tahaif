"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { useDeliveryStore } from "@/stores/delivery.store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/**
 * "Where are you sending it?" — the first step of the North-Star story. Sets the
 * shared Deliver-to city and opens gifts that deliver there.
 */
export function HeroFinder() {
  const router = useRouter();
  const id = useId();
  const cities = useDeliveryStore((s) => s.cities);
  const cityId = useDeliveryStore((s) => s.cityId);
  const setCity = useDeliveryStore((s) => s.setCity);
  const loadCities = useDeliveryStore((s) => s.loadCities);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  return (
    <form
      role="search"
      aria-label="Find gifts by city"
      className="flex w-full flex-col gap-3 rounded-2xl bg-card p-3 text-card-foreground shadow-lg sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(cityId ? `/search?city_id=${encodeURIComponent(cityId)}` : "/search");
      }}
    >
      <div className="min-w-0 flex-1 space-y-1 text-start">
        <label htmlFor={id} className="flex items-center gap-1.5 px-1 text-sm font-medium">
          <MapPin aria-hidden className="h-4 w-4 text-link" />
          Deliver to
        </label>
        <Select id={id} value={cityId ?? ""} onChange={(e) => setCity(e.target.value || null)}>
          <option value="">Any city in Pakistan</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="lg" className="gap-2">
        Find gifts
        <ArrowRight aria-hidden className="h-5 w-5 rtl:rotate-180" />
      </Button>
    </form>
  );
}
