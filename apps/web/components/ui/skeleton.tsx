import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Hidden from assistive tech — put `aria-busy` on the
 * region that is loading instead. Pulses only when motion is allowed.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

/** Placeholder with the same footprint as ProductCard, to avoid layout shift. */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border bg-card">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
