import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi, primaryImage } from "@/lib/catalog";
import { loyaltyApi } from "@/lib/loyalty";
import { VariantPicker } from "@/components/catalog/VariantPicker";
import { ReviewsSection } from "@/components/catalog/ReviewsSection";
import { ChevronRight, Clock, Truck } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogApi.getProduct(slug).catch(() => null);
  if (!product) return { title: "Product Not Found" };
  return {
    title: product.name,
    description: product.description ?? undefined,
    openGraph: { images: [primaryImage(product)] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  const product = await catalogApi.getProduct(slug).catch(() => null);
  if (!product) notFound();

  const [categories, cities, reviews] = await Promise.all([
    catalogApi.getCategories(),
    catalogApi.getCities(),
    loyaltyApi.listReviews(product.id).catch(() => []),
  ]);

  const flat = (cats: typeof categories): typeof categories =>
    cats.flatMap((c) => [c, ...flat(c.children)]);
  const category = flat(categories).find((c) => c.id === product.category_id);

  const availableCities = product.product_cities
    .filter((pc) => pc.is_available)
    .map((pc) => ({
      ...pc,
      city: cities.find((c) => c.id === pc.city_id),
    }))
    .filter((pc) => pc.city);

  const img = primaryImage(product);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 flex-wrap">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        {category && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <Link href={`/c/${category.slug}`} className="hover:text-foreground transition-colors">
              {category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted">
          <Image
            src={img}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
            unoptimized
          />
        </div>

        {/* Details */}
        <div className="space-y-6">
          {/* Vendor */}
          {product.vendor && (
            <Link
              href={`/vendor/${product.vendor.slug}`}
              className="text-sm text-primary-600 font-medium hover:underline"
            >
              {product.vendor.name}
            </Link>
          )}

          <h1 className="text-3xl font-bold leading-tight">{product.name}</h1>

          {product.description && (
            <p className="text-muted-foreground leading-relaxed">{product.description}</p>
          )}

          {/* Variant picker + price + cart button */}
          <VariantPicker product={product} />

          {/* Delivery availability */}
          {availableCities.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-primary-600" />
                Delivery available in
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {availableCities.map((pc) => (
                  <div
                    key={pc.city_id}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{pc.city!.name}</span>
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Clock className="h-3 w-3" />
                      {pc.lead_time_hours}h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <ReviewsSection productId={product.id} initialReviews={reviews} />
    </div>
  );
}
