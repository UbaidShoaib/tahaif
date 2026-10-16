import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { City, Vendor } from "@/lib/catalog";
import { isOptimizable } from "@/lib/image-hosts";

type Props = { vendor: Vendor; city?: City };

/**
 * Who actually makes the gift. Buyers abroad can't walk into the shop, so a
 * named local maker with their own words builds more trust than a marketplace
 * listing. Renders nothing without a description: an empty card adds nothing.
 */
export function VendorStory({ vendor, city }: Props) {
  if (!vendor.description) return null;
  return (
    <section aria-labelledby="vendor-story" className="flex items-start gap-4 border-t pt-6">
      {vendor.logo_url ? (
        <Image
          src={vendor.logo_url}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-xl border object-cover"
          unoptimized={!isOptimizable(vendor.logo_url)}
        />
      ) : (
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl font-bold text-link"
        >
          {vendor.name[0]}
        </div>
      )}
      <div className="min-w-0 space-y-1">
        <h2 id="vendor-story" className="font-display text-lg">
          Made by {vendor.name}
        </h2>
        {city && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin aria-hidden className="h-3.5 w-3.5" />
            A local shop in {city.name}
          </p>
        )}
        <p className="text-sm leading-relaxed text-foreground-secondary">{vendor.description}</p>
        <Link href={`/vendor/${vendor.slug}`} className="inline-block text-sm font-medium text-link hover:underline">
          More from {vendor.name}
        </Link>
      </div>
    </section>
  );
}
