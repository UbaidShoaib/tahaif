import Link from "next/link";
import Image from "next/image";
import { Price } from "@/components/money/Price";
import { DeliveryBadge } from "@/components/catalog/DeliveryBadge";
import { primaryImage, type Product } from "@/lib/catalog";

type Props = {
  product: Product;
  /** The buyer's city: prices and the delivery badge follow it. */
  cityId?: string;
};

export function ProductCard({ product, cityId }: Props) {
  const img = primaryImage(product);
  const primary = product.images.find((i) => i.is_primary) ?? product.images[0];

  // With a city, show what the buyer pays there; without one, the base price —
  // the same price the API filters and sorts on, so cards agree with the filters.
  const cityAvailability = cityId ? product.product_cities.find((pc) => pc.city_id === cityId) : undefined;
  const basePrice = cityAvailability?.price_override_pkr ?? product.base_price_pkr;

  // "From" whenever the sizes on offer cost different amounts; the price shown is the cheapest.
  const deltas = product.variants.filter((v) => v.is_active).map((v) => v.price_delta_pkr);
  const cheapestDelta = deltas.length > 0 ? Math.min(...deltas) : 0;
  const pricesVary = new Set(deltas).size > 1;

  return (
    <Link
      href={`/p/${product.slug}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-all group-hover:border-primary-300 group-hover:shadow-md">
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={img}
            alt={primary?.alt_text ?? product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
            unoptimized
          />
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          {product.vendor && <p className="truncate text-xs text-muted-foreground">{product.vendor.name}</p>}
          <h3 className="line-clamp-2 font-sans text-sm font-medium leading-snug tracking-normal transition-colors group-hover:text-link">
            {product.name}
          </h3>
          <p className="mt-auto pt-1 text-sm font-semibold text-link">
            <Price pkr={basePrice + cheapestDelta} from={pricesVary} />
          </p>
          {cityId && cityAvailability && <DeliveryBadge pc={cityAvailability} />}
        </div>
      </article>
    </Link>
  );
}
