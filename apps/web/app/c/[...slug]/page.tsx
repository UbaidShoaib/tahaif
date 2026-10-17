import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi } from "@/lib/catalog";
import { fetchListing, parseListingParams } from "@/lib/listing";
import { ProductListing } from "@/components/catalog/ProductListing";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { canonical } from "@/lib/seo";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = slug.length === 1 ? await catalogApi.getCategoryBySlug(slug[0]) : null;
  if (!category) return { title: "Category Not Found" };
  // Sort, price and city filters all point back at the unfiltered category.
  return { title: category.name, ...canonical(`/c/${category.slug}`) };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // One segment only, so /c/cakes/anything isn't a duplicate of /c/cakes.
  if (slug.length !== 1) notFound();
  const categorySlug = slug[0];

  const [category, allCategories] = await Promise.all([
    catalogApi.getCategoryBySlug(categorySlug),
    catalogApi.getCategories().catch(() => []),
  ]);
  if (!category) notFound();

  const scope = { category_id: category.id };
  const initial = await fetchListing(scope, parseListingParams(await searchParams), 1).catch(() => null);

  const linkClass = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors lg:block lg:rounded-lg lg:px-3",
      active ? "bg-primary-soft text-primary-soft-foreground" : "text-foreground hover:bg-muted",
    );

  const categoryNav = (
    <nav aria-label="Categories">
      <h2 className="mb-2 hidden font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">
        Categories
      </h2>
      <ul className="flex gap-2 lg:block lg:space-y-0.5">
        {allCategories.map((cat) => (
          <li key={cat.id}>
            <Link
              href={`/c/${cat.slug}`}
              aria-current={cat.slug === categorySlug ? "page" : undefined}
              className={cn(linkClass(cat.slug === categorySlug), "flex min-h-11 items-center lg:min-h-0 lg:py-2")}
            >
              {cat.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: category.name }]} />
      <h1 className="mb-4 text-h1">{category.name}</h1>

      {/* Phones and tablets: categories as a swipeable row instead of a hidden sidebar. */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 lg:hidden">{categoryNav}</div>

      <Suspense>
        <ProductListing
          scope={scope}
          initial={initial}
          aside={categoryNav}
          emptyTitle={`No ${category.name.toLowerCase()} here yet`}
        />
      </Suspense>
    </div>
  );
}
