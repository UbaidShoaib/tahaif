import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi, type Category, type City } from "@/lib/catalog";
import { fetchListing, parseListingParams } from "@/lib/listing";
import { cityCopy, countProducts, getCityBySlug, MIN_CITY_PRODUCTS } from "@/lib/city-seo";
import { ProductListing } from "@/components/catalog/ProductListing";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { canonical, NOINDEX } from "@/lib/seo";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * /c/{category} or /c/{category}/{city}. Anything else, including a second
 * segment that isn't a city, is not found so no page has duplicates.
 */
async function resolve(slug: string[]): Promise<{ category: Category; city: City | null } | null> {
  if (slug.length < 1 || slug.length > 2) return null;
  const [category, city] = await Promise.all([
    catalogApi.getCategoryBySlug(slug[0]),
    slug[1] ? getCityBySlug(slug[1]) : Promise.resolve(null),
  ]);
  if (!category || (slug[1] && !city)) return null;
  return { category, city };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve((await params).slug);
  if (!found) return { title: "Category Not Found" };
  const { category, city } = found;
  if (!city) {
    // Sort, price and date filters all point back at the unfiltered category.
    return {
      title: cityCopy.nationalTitle(category.name),
      description: cityCopy.nationalDescription(category.name),
      ...canonical(`/c/${category.slug}`),
    };
  }
  const count = await countProducts({ category_id: category.id, city_id: city.id });
  return {
    title: cityCopy.categoryTitle(category.name, city.name),
    description: cityCopy.categoryDescription(category.name, city.name, count),
    ...canonical(`/c/${category.slug}/${city.slug}`),
    // Too few gifts for a useful page: buyers can use it, search engines skip it.
    ...(count < MIN_CITY_PRODUCTS && NOINDEX),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const found = await resolve((await params).slug);
  if (!found) notFound();
  const { category, city } = found;

  const [allCategories, cities] = await Promise.all([
    catalogApi.getCategories().catch(() => []),
    catalogApi.getCities().catch(() => []),
  ]);
  const scope = { category_id: category.id };
  const listingParams = parseListingParams(await searchParams);
  const initial = await fetchListing(scope, city ? { ...listingParams, cityId: city.id } : listingParams, 1).catch(
    () => null,
  );

  // Category links keep the city, so a buyer in Gujranwala stays in Gujranwala.
  const citySuffix = city ? `/${city.slug}` : "";
  const pill = (active: boolean) =>
    cn(
      "flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
      active ? "bg-primary-soft text-primary-soft-foreground" : "text-foreground hover:bg-muted",
    );

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          ...(city
            ? [
                { label: city.name, href: `/city/${city.slug}` },
                { label: category.name, href: `/c/${category.slug}` },
                { label: `${category.name} in ${city.name}` },
              ]
            : [{ label: category.name }]),
        ]}
      />
      <h1 className="text-h1">{city ? cityCopy.categoryHeading(category.name, city.name) : category.name}</h1>
      {city && (
        <p className="mt-2 max-w-2xl text-foreground-secondary">
          {cityCopy.categoryDescription(category.name, city.name, initial?.total ?? 0)}
        </p>
      )}

      {/* Categories as a swipeable row; the filter chips sit just below. */}
      <nav aria-label="Categories" className="-mx-4 mb-4 mt-4 overflow-x-auto px-4 pb-1">
        <ul className="flex gap-2">
          {allCategories.map((cat) => (
            <li key={cat.id}>
              <Link
                href={`/c/${cat.slug}${citySuffix}`}
                aria-current={cat.id === category.id ? "page" : undefined}
                className={pill(cat.id === category.id)}
              >
                {cat.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense>
        <ProductListing
          scope={scope}
          initial={initial}
          city={city ?? undefined}
          emptyTitle={`No ${category.name.toLowerCase()} ${city ? `deliver to ${city.name}` : "here"} yet`}
        />
      </Suspense>

      {cities.length > 0 && (
        <nav aria-labelledby="by-city-heading" className="mt-14 border-t pt-8">
          <h2 id="by-city-heading" className="text-h2">
            {category.name} delivery by city
          </h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {cities.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${category.slug}/${c.slug}`}
                  aria-current={c.id === city?.id ? "page" : undefined}
                  className="text-link hover:underline aria-[current=page]:font-semibold aria-[current=page]:no-underline"
                >
                  {category.name} in {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
