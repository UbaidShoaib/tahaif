import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi, primaryImage } from "@/lib/catalog";
import { loyaltyApi } from "@/lib/loyalty";
import { VariantPicker } from "@/components/catalog/VariantPicker";
import { ReviewsSection } from "@/components/catalog/ReviewsSection";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Rating } from "@/components/ui/rating";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { TrustList } from "@/components/catalog/TrustList";
import { onTimePercent } from "@/lib/stats";
import { VendorStory } from "@/components/catalog/VendorStory";
import { ProductCard } from "@/components/catalog/ProductCard";

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

  const [categories, cities, reviews, vendorOnTime, vendor, related] = await Promise.all([
    catalogApi.getCategories(),
    catalogApi.getCities(),
    loyaltyApi.listReviews(product.id).catch(() => []),
    onTimePercent(product.vendor_id),
    // Optional: the page still renders if the vendor lookup fails.
    product.vendor ? catalogApi.getVendor(product.vendor.slug).catch(() => null) : Promise.resolve(null),
    // "You might also like": others from the same category; optional like the vendor.
    product.category_id
      ? catalogApi
          .getProducts({ category_id: product.category_id, page_size: 5 })
          .then((r) => r.items.filter((p) => p.id !== product.id).slice(0, 4))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const flat = (cats: typeof categories): typeof categories =>
    cats.flatMap((c) => [c, ...flat(c.children)]);
  const category = flat(categories).find((c) => c.id === product.category_id);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length
      : null;

  const img = primaryImage(product);

  // product_view is captured server-side via page render; PostHog client picks it up via pageview
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: img,
    brand: product.vendor ? { "@type": "Brand", name: product.vendor.name } : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "PKR",
      price: (product.base_price_pkr / 100).toFixed(2),
      availability: product.is_active
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    ...(reviews.length > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: (
          reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length
        ).toFixed(1),
        reviewCount: reviews.length,
      },
    }),
  };

  return (
    <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
    <div className="container mx-auto px-4 pb-28 pt-6 md:py-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          ...(category ? [{ label: category.name, href: `/c/${category.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-10 lg:gap-16">
        {/* The photos stay in view while the buyer works through the buy box */}
        <div className="md:sticky md:top-24 md:self-start">
          <ProductGallery images={product.images} productName={product.name} />
        </div>

        {/* Details */}
        <div className="space-y-7">
          <div className="space-y-3">
            {product.vendor && (
              <Link
                href={`/vendor/${product.vendor.slug}`}
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-link"
              >
                {product.vendor.name}
              </Link>
            )}
            <h1 className="text-h1">{product.name}</h1>
            {avgRating !== null && (
              <a href="#reviews" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Rating value={Number(avgRating.toFixed(1))} size="sm" />
                <span>
                  {avgRating.toFixed(1)} · {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                </span>
              </a>
            )}
            <span aria-hidden className="block h-px w-12 bg-gold" />
          </div>

          <VariantPicker product={product} cities={cities} />

          <TrustList onTimePercent={vendorOnTime} />

          {product.description && (
            <section aria-labelledby="about-heading" className="border-t pt-6">
              <h2 id="about-heading" className="font-display text-lg">
                About this gift
              </h2>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground-secondary">{product.description}</p>
            </section>
          )}

          {vendor && <VendorStory vendor={vendor} city={cities.find((c) => c.id === vendor.city_id)} />}
        </div>
      </div>

      {/* Reviews */}
      <ReviewsSection productId={product.id} initialReviews={reviews} />

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-16 border-t pt-12">
          <h2 id="related-heading" className="text-h2">
            You might also like
          </h2>
          <span aria-hidden className="mb-8 mt-3 block h-px w-12 bg-gold" />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:gap-x-6">
            {related.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    </>
  );
}
