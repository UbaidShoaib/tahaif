import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { primaryImage, type Product } from "@/lib/catalog";

type Props = {
  product: Product;
  cityId?: string;
};

export function ProductCard({ product, cityId }: Props) {
  const img = primaryImage(product);

  const cityAvailability = cityId
    ? product.product_cities.find((pc) => pc.city_id === cityId)
    : product.product_cities[0];

  const displayPrice = cityAvailability?.price_override_pkr ?? product.base_price_pkr;

  const lowestVariantDelta =
    product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.price_delta_pkr))
      : 0;

  return (
    <Link href={`/p/${product.slug}`} className="group block">
      <div className="overflow-hidden rounded-xl border bg-background transition-all group-hover:shadow-md group-hover:border-primary-300">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={img}
            alt={product.images[0]?.alt_text ?? product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          {product.vendor && (
            <p className="text-xs text-muted-foreground truncate">{product.vendor.name}</p>
          )}
          <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary-600 transition-colors">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-1 pt-0.5">
            <span className="font-semibold text-sm text-primary-700 dark:text-primary-400">
              {lowestVariantDelta > 0 ? "From " : ""}
              {formatPrice(displayPrice + lowestVariantDelta)}
            </span>
          </div>
          {cityAvailability && (
            <p className="text-xs text-muted-foreground">
              Delivery in {cityAvailability.lead_time_hours}h
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
