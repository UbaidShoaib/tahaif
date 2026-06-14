import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi } from "@/lib/catalog";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ChevronRight } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const occasion = await catalogApi.getOccasion(slug).catch(() => null);
  if (!occasion) return { title: "Occasion Not Found" };
  return {
    title: `${occasion.name} Gifts`,
    description: `Send the perfect ${occasion.name} gift to Pakistan. Cakes, flowers, and more.`,
  };
}

export default async function OccasionPage({ params }: Props) {
  const { slug } = await params;

  const occasion = await catalogApi.getOccasion(slug).catch(() => null);
  if (!occasion) notFound();

  const { items: products } = await catalogApi
    .getProducts({ occasion_id: occasion.id, page_size: 48 })
    .catch(() => ({ items: [], total: 0, page: 1, page_size: 48 }));

  const occasions = await catalogApi.getOccasions().catch(() => []);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{occasion.name}</span>
      </nav>

      {/* Banner */}
      {occasion.banner_url ? (
        <div className="relative h-48 md:h-64 rounded-2xl overflow-hidden mb-8">
          <Image
            src={occasion.banner_url}
            alt={occasion.name}
            fill
            sizes="100vw"
            className="object-cover"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
            <div>
              <h1 className="text-3xl font-bold text-white">{occasion.name}</h1>
              {occasion.name_ur && (
                <p className="text-white/80 text-lg mt-1" dir="rtl">{occasion.name_ur}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{occasion.name}</h1>
          {occasion.name_ur && (
            <p className="text-muted-foreground text-lg mt-1" dir="rtl">{occasion.name_ur}</p>
          )}
        </div>
      )}

      <div className="flex gap-8">
        {/* Sidebar — occasions */}
        <aside className="hidden md:block w-52 shrink-0">
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
            Occasions
          </h3>
          <nav className="space-y-0.5">
            {occasions.map((o) => (
              <Link
                key={o.id}
                href={`/occasion/${o.slug}`}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  o.slug === slug
                    ? "bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/40 dark:text-primary-300"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {o.name}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-6">
            <p className="text-sm text-muted-foreground">
              {products.length} gift{products.length !== 1 ? "s" : ""} available
            </p>
          </div>

          <ProductGrid
            products={products}
            emptyMessage={`No gifts available for ${occasion.name} yet — check back soon.`}
          />
        </main>
      </div>
    </div>
  );
}
