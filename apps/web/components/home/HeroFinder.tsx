"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Gift, MapPin } from "lucide-react";
import { addDays, formatDeliveryDay, zonedNow } from "@/lib/delivery";
import { useDeliveryStore } from "@/stores/delivery.store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/** How many days ahead the date picker offers, today included. */
const DAYS_AHEAD = 7;

type Props = {
  /** Occasions to offer; the choice opens that occasion's page. */
  occasions?: { slug: string; name: string }[];
};

/**
 * "Who are you celebrating?" — the first step of the North-Star story. City,
 * day and occasion are asked together so every result can actually arrive.
 * The city is the shared Deliver-to choice; the day becomes the listing's
 * arrival filter (?on=).
 */
export function HeroFinder({ occasions = [] }: Props) {
  const router = useRouter();
  const id = useId();
  const cities = useDeliveryStore((s) => s.cities);
  const cityId = useDeliveryStore((s) => s.cityId);
  const setCity = useDeliveryStore((s) => s.setCity);
  const loadCities = useDeliveryStore((s) => s.loadCities);
  const [day, setDay] = useState("");
  const [occasion, setOccasion] = useState("");

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  const tz = cities.find((c) => c.id === cityId)?.timezone ?? "Asia/Karachi";
  const days = useMemo(() => {
    const today = zonedNow(tz).date;
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const date = addDays(today, i);
      return { date, label: formatDeliveryDay(date, tz) };
    });
  }, [tz]);

  return (
    <form
      role="search"
      aria-label="Find gifts"
      className="grid w-full gap-3 rounded-2xl bg-card p-3 text-card-foreground shadow-lg sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const qs = new URLSearchParams();
        if (cityId) qs.set("city_id", cityId);
        // A day only filters with a city; without one it would be ignored anyway.
        if (cityId && day) qs.set("on", day);
        const path = occasion ? `/occasion/${encodeURIComponent(occasion)}` : "/search";
        router.push(qs.size > 0 ? `${path}?${qs.toString()}` : path);
      }}
    >
      <div className="min-w-0 space-y-1 text-start">
        <label htmlFor={`${id}-city`} className="flex items-center gap-1.5 px-1 text-sm font-medium">
          <MapPin aria-hidden className="h-4 w-4 text-link" />
          Deliver to
        </label>
        <Select id={`${id}-city`} value={cityId ?? ""} onChange={(e) => setCity(e.target.value || null)}>
          <option value="">Any city in Pakistan</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-0 space-y-1 text-start">
        <label htmlFor={`${id}-day`} className="flex items-center gap-1.5 px-1 text-sm font-medium">
          <CalendarDays aria-hidden className="h-4 w-4 text-link" />
          Arrives on
        </label>
        <Select id={`${id}-day`} value={day} onChange={(e) => setDay(e.target.value)} disabled={!cityId}>
          <option value="">{cityId ? "Any day" : "Choose a city first"}</option>
          {days.map((d) => (
            <option key={d.date} value={d.date}>
              {d.label}
            </option>
          ))}
        </Select>
      </div>
      {occasions.length > 0 && (
        <div className="min-w-0 space-y-1 text-start">
          <label htmlFor={`${id}-occasion`} className="flex items-center gap-1.5 px-1 text-sm font-medium">
            <Gift aria-hidden className="h-4 w-4 text-link" />
            Occasion
          </label>
          <Select id={`${id}-occasion`} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            <option value="">Any occasion</option>
            {occasions.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Button type="submit" size="lg" className="gap-2 sm:col-span-2 lg:col-span-1">
        Find gifts
        <ArrowRight aria-hidden className="h-5 w-5 rtl:rotate-180" />
      </Button>
    </form>
  );
}
