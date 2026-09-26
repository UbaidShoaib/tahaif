"use client";

import { useEffect, useId } from "react";
import { MapPin } from "lucide-react";
import { useDeliveryStore } from "@/stores/delivery.store";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * "Deliver to" city choice, shared by the header, mobile menu, search and
 * checkout. A native select keeps the OS picker on phones.
 */
export function DeliveryPicker({ compact = false, className }: { compact?: boolean; className?: string }) {
  const id = useId();
  const cities = useDeliveryStore((s) => s.cities);
  const cityId = useDeliveryStore((s) => s.cityId);
  const setCity = useDeliveryStore((s) => s.setCity);
  const loadCities = useDeliveryStore((s) => s.loadCities);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  if (cities.length === 0) return null;

  return (
    <div className={cn(compact ? "flex items-center gap-1.5" : "space-y-1.5", className)}>
      <label htmlFor={id} className={cn("flex items-center gap-1.5 whitespace-nowrap text-sm", !compact && "font-medium")}>
        <MapPin aria-hidden className="h-4 w-4 shrink-0 text-link" />
        {/* In the header the pin icon stands in for the words; screen readers still hear them. */}
        <span className={cn(compact && "sr-only")}>Deliver to</span>
      </label>
      <Select
        id={id}
        value={cityId ?? ""}
        onChange={(e) => setCity(e.target.value || null)}
        className={cn(compact && "h-9 w-auto border-transparent bg-transparent ps-1 font-medium hover:border-input sm:text-sm")}
      >
        <option value="">Any city</option>
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
