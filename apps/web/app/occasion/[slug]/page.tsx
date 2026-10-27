import Link from "next/link";
import Image from "next/image";
import { isOptimizable } from "@/lib/image-hosts";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi } from "@/lib/catalog";
import { Suspense } from "react";
import { fetchListing, parseListingParams } from "@/lib/listing";
import { ProductListing } from "@/components/catalog/ProductListing";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { canonical } from "@/lib/seo";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const occasion = await catalogApi.getOccasion(slug).catch(() => null);
  if (!occasion) return { title: "Occasion Not Found" };
  return {
    title: `${occasion.name} Gifts`,
    description: `Send the perfect ${occasion.name} gift to Pakistan. Cakes, flowers, and more.`,
    ...canonical(`/occasion/${occasion.slug}`),
  };
}

export default async function OccasionPage({ params, searchParams }: Props) {
  const { slug } = await params;

  const occasion = await catalogApi.getOccasion(slug).catch(() => null);
  if (!occasion) notFound();

  const scope = { occasion_id: occasion.id };
  const initial = await fetchListing(scope, parseListingParams(await searchParams), 1).catch(() => null);

  const occasions = await catalogApi.getOccasions().catch(() => []);

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: occasion.name }]} />

      {/* Banner */}
      {occasion.banner_url ? (
        <div className="relative h-48 md:h-64 rounded-2xl overflow-hidden mb-8">
          <Image
            src={occasion.banner_url}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
            unoptimized={!isOptimizable(occasion.banner_url)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
            <div>
              <h1 className="text-h1 text-white">{occasion.name}</h1>
              {occasion.name_ur && (
                <p className="text-white/80 text-lg mt-1" dir="rtl">{occasion.name_ur}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="text-h1">{occasion.name}</h1>
          {occasion.name_ur && (
            <p className="text-muted-foreground text-lg mt-1" dir="rtl">{occasion.name_ur}</p>
          )}
        </div>
      )}

      <nav aria-label="Occasions" className="-mx-4 mb-4 overflow-x-auto px-4 pb-1">
        <ul className="flex gap-2">
          {occasions.map((o) => (
            <li key={o.id}>
              <Link
                href={`/occasion/${o.slug}`}
                aria-current={o.slug === slug ? "page" : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                  o.slug === slug ? "bg-primary-soft text-primary-soft-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense>
        <ProductListing
          scope={scope}
          initial={initial}
          emptyTitle={`No gifts for ${occasion.name} yet`}
        />
      </Suspense>
    </div>
  );
}
