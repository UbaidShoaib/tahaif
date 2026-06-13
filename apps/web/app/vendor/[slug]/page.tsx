import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi } from "@/lib/catalog";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { MapPin, ChevronRight } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await catalogApi.getVendor(slug).catch(() => null);
  if (!vendor) return { title: "Vendor Not Found" };
  return { title: vendor.name, description: vendor.description ?? undefined };
}

export default async function VendorPage({ params }: Props) {
  const { slug } = await params;

  const vendor = await catalogApi.getVendor(slug).catch(() => null);
  if (!vendor) notFound();

  const [{ items: products }, cities] = await Promise.all([
    catalogApi.getProducts({ vendor_id: vendor.id, page_size: 48 }),
    catalogApi.getCities(),
  ]);

  const city = cities.find((c) => c.id === vendor.city_id);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{vendor.name}</span>
      </nav>

      {/* Vendor header */}
      <div className="mb-8 p-6 rounded-2xl border bg-muted/30 flex items-start gap-5">
        {vendor.logo_url ? (
          <Image
            src={vendor.logo_url}
            alt={vendor.name}
            width={64}
            height={64}
            className="h-16 w-16 rounded-xl object-cover border"
            unoptimized
          />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-2xl font-bold text-primary-600 shrink-0">
            {vendor.name[0]}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{vendor.name}</h1>
          {city && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3.5 w-3.5" />
              <span>{city.name}</span>
            </div>
          )}
          {vendor.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              {vendor.description}
            </p>
          )}
        </div>
      </div>

      {/* Products */}
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-xl font-semibold">All products</h2>
        <span className="text-sm text-muted-foreground">
          {products.length} item{products.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ProductGrid
        products={products}
        emptyMessage={`${vendor.name} hasn't listed any products yet.`}
      />
    </div>
  );
}
