import { ProductCardSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Route-level loading state for listing pages; same footprint as the real grid. */
export function ListingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading gifts" className="container mx-auto px-4 py-8">
      <Skeleton className="mb-6 h-4 w-40" />
      <Skeleton className="mb-6 h-9 w-56" />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <ProductCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
