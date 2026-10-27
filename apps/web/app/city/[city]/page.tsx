import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi, type Category, type VendorSummary } from "@/lib/catalog";
import { fetchListing, parseListingParams } from "@/lib/listing";
import { cityCopy, countByCity, countProducts, getCityBySlug, listAllProducts } from "@/lib/city-seo";
import { canonical, NOINDEX } from "@/lib/seo";
import { ProductListing } from "@/components/catalog/ProductListing";
import { Breadcrumb } from "@/components/ui/breadcrumb";

// No loading.tsx here: an unknown city must answer 404 before the page streams.

type Props = {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const city = await getCityBySlug((await params).city);
  if (!city) return { title: "City Not Found" };
  const count = await countProducts({ city_id: city.id });
  return {
    title: cityCopy.hubTitle(city.name),
    description: cityCopy.hubDescription(city.name, count),
    ...canonical(`/city/${city.slug}`),
    // A city with nothing to send yet stays out of search results.
    ...(count === 0 && NOINDEX),
  };
}

const flatten = (cats: Category[]): Category[] => cats.flatMap((c) => [c, ...flatten(c.children)]);

export default async function CityPage({ params, searchParams }: Props) {
  const city = await getCityBySlug((await params).city);
  if (!city) notFound();

  const [products, categories, initial] = await Promise.all([
    listAllProducts({ city_id: city.id }),
    catalogApi.getCategories().catch(() => []),
    fetchListing({}, { ...parseListingParams(await searchParams), cityId: city.id }, 1).catch(() => null),
  ]);

  const { byCategoryCity } = countByCity(products);
  const cityCategories = flatten(categories)
    .map((c) => ({ ...c, count: byCategoryCity.get(`${c.id}:${city.id}`) ?? 0 }))
    .filter((c) => c.count > 0);
  const shops = [
    ...new Map(products.flatMap((p): [string, VendorSummary][] => (p.vendor ? [[p.vendor.id, p.vendor]] : []))).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: city.name }]} />
      <h1 className="text-h1">{cityCopy.hubHeading(city.name)}</h1>
      <p className="mt-2 max-w-2xl text-foreground-secondary">{cityCopy.hubDescription(city.name, products.length)}</p>

      {cityCategories.length > 0 && (
        <nav aria-label={`Gifts in ${city.name} by category`} className="-mx-4 mt-6 overflow-x-auto px-4 pb-1">
          <ul className="flex gap-2">
            {cityCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}/${city.slug}`}
                  className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-input px-4 text-sm font-medium transition-colors hover:border-primary-700 hover:bg-primary-soft"
                >
                  {c.name} in {city.name}
                  <span className="ms-1.5 text-muted-foreground">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-6">
        <Suspense>
          <ProductListing city={city} initial={initial} emptyTitle={`No gifts deliver to ${city.name} yet`} />
        </Suspense>
      </div>

      {shops.length > 0 && (
        <section aria-labelledby="shops-heading" className="mt-14 border-t pt-8">
          <h2 id="shops-heading" className="text-h2">
            Shops delivering in {city.name}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {shops.map((v) => (
              <li key={v.id}>
                <Link href={`/vendor/${v.slug}`} className="text-link hover:underline">
                  {v.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
