import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail. The last item is the current page (no link,
 * aria-current="page"). Chevrons flip in RTL.
 */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-6 text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" />}
              {last || !c.href ? (
                <span aria-current={last ? "page" : undefined} className={cn(last && "max-w-[14rem] truncate font-medium text-foreground")}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="rounded-sm transition-colors hover:text-foreground hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
