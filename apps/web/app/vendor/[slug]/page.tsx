import Image from "next/image";
import Link from "next/link";
import { isOptimizable } from "@/lib/image-hosts";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi } from "@/lib/catalog";
import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { fetchListing, parseListingParams } from "@/lib/listing";
import { ProductListing } from "@/components/catalog/ProductListing";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { canonical } from "@/lib/seo";
import { cityCopy } from "@/lib/city-seo";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await catalogApi.getVendor(slug).catch(() => null);
  if (!vendor) return { title: "Vendor Not Found" };
  // "Bouquet Bar, Gujranwala": people search a shop by name and city.
  const city = (await catalogApi.getCities().catch(() => [])).find((c) => c.id === vendor.city_id);
  return {
    title: cityCopy.vendorTitle(vendor.name, city?.name),
    description: cityCopy.vendorDescription(vendor.name, city?.name, vendor.description),
    ...canonical(`/vendor/${vendor.slug}`),
  };
}

export default async function VendorPage({ params, searchParams }: Props) {
  const { slug } = await params;

  const vendor = await catalogApi.getVendor(slug).catch(() => null);
  if (!vendor) notFound();

  const scope = { vendor_id: vendor.id };
  const [initial, cities] = await Promise.all([
    fetchListing(scope, parseListingParams(await searchParams), 1).catch(() => null),
    catalogApi.getCities().catch(() => []),
  ]);

  const city = cities.find((c) => c.id === vendor.city_id);

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          ...(city ? [{ label: city.name, href: `/city/${city.slug}` }] : []),
          { label: vendor.name },
        ]}
      />

      {/* Vendor header */}
      <div className="mb-8 p-6 rounded-2xl border bg-muted/30 flex items-start gap-5">
        {vendor.logo_url ? (
          <Image
            src={vendor.logo_url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-xl object-cover border"
            unoptimized={!isOptimizable(vendor.logo_url)}
          />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-primary-soft flex items-center justify-center text-2xl font-bold text-link shrink-0">
            {vendor.name[0]}
          </div>
        )}
        <div>
          <h1 className="text-h1">{vendor.name}</h1>
          {city && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              <Link href={`/city/${city.slug}`} className="hover:text-foreground hover:underline">
                {city.name}
              </Link>
            </div>
          )}
          {vendor.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              {vendor.description}
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-4 text-h2">All gifts from {vendor.name}</h2>
      <Suspense>
        <ProductListing scope={scope} initial={initial} emptyTitle={`${vendor.name} hasn't listed any gifts yet`} />
      </Suspense>
    </div>
  );
}
