import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductListing } from "@/components/catalog/ProductListing";
import { fetchListing, parseListingParams } from "@/lib/listing";

export const metadata: Metadata = {
  title: "Find a gift",
  description: "Search cakes, flowers, perfumes and more for delivery across Pakistan.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SearchPage({ searchParams }: Props) {
  const params = parseListingParams(await searchParams);
  const initial = await fetchListing({}, params, 1).catch(() => null);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-center text-h1">{params.q ? `Gifts matching “${params.q}”` : "Find the perfect gift"}</h1>
      {/* useSearchParams in the listing needs a Suspense boundary. */}
      <Suspense>
        <ProductListing initial={initial} showSearch emptyTitle="No gifts match your search" />
      </Suspense>
    </div>
  );
}
