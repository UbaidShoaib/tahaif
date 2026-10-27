"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";

export type Section =
  | "attention" | "orders" | "new-order" | "messages" | "campaigns" | "applications" | "add-product" | "products" | "note-reports"
  | "builders" | "team" | "activity";

type Item = { key: Section; label: string; adminOnly?: boolean };

export const NAV: { group: string; items: Item[] }[] = [
  { group: "Today", items: [{ key: "attention", label: "Needs attention" }] },
  {
    group: "Orders",
    items: [
      { key: "orders", label: "Orders" },
      { key: "new-order", label: "New DM order" },
      { key: "messages", label: "Messages to send" },
    ],
  },
  {
    group: "Catalog",
    items: [
      { key: "products", label: "Products" },
      { key: "add-product", label: "Add product" },
      { key: "builders", label: "Build-your-own" },
    ],
  },
  {
    group: "Shops & content",
    items: [
      { key: "applications", label: "Shop applications" },
      { key: "note-reports", label: "Reported notes" },
    ],
  },
  { group: "Reports", items: [{ key: "campaigns", label: "Sales by campaign" }] },
  // Who has access, and every staff member's actions and IPs: admins only (the API enforces it too).
  {
    group: "Admin",
    items: [
      { key: "team", label: "Team", adminOnly: true },
      { key: "activity", label: "Activity", adminOnly: true },
    ],
  },
];

export function visibleSections(isAdmin: boolean): Item[] {
  return NAV.flatMap((g) => g.items).filter((i) => isAdmin || !i.adminOnly);
}

/**
 * Admin layout: grouped sidebar on desktop, a scrolling row on phones. The
 * dashboard passes `onSelect` so switching sections stays on the page; other
 * admin pages (an order, a product) get plain links back to `/admin?section=…`.
 */
export function AdminShell({
  active,
  onSelect,
  children,
}: {
  active: Section;
  onSelect?: (s: Section) => void;
  children: ReactNode;
}) {
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) }))
    .filter((g) => g.items.length > 0);

  const itemClass = (on: boolean) =>
    cn(
      "block shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
    );

  return (
    <div className="container mx-auto px-4 py-6 md:flex md:gap-8 md:py-8">
      <aside className="mb-6 md:mb-0 md:w-56 md:shrink-0">
        <p className="mb-4 flex items-center gap-2 text-lg font-bold">
          <Package aria-hidden className="h-5 w-5 text-link" /> Back office
        </p>
        <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 md:sticky md:top-20 md:mx-0 md:overflow-visible md:px-0">
          <div className="flex gap-1 md:flex-col md:gap-5">
            {groups.map((g) => (
              <div key={g.group} className="contents md:block">
                <p className="mb-1 hidden px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
                  {g.group}
                </p>
                <ul className="contents md:block md:space-y-0.5">
                  {g.items.map((i) => {
                    const on = i.key === active;
                    return (
                      <li key={i.key} className="contents md:block">
                        {onSelect ? (
                          <button type="button" className={cn(itemClass(on), "md:w-full md:text-left")}
                            aria-current={on ? "page" : undefined} onClick={() => onSelect(i.key)}>
                            {i.label}
                          </button>
                        ) : (
                          <Link href={`/admin?section=${i.key}`} className={itemClass(on)} aria-current={on ? "page" : undefined}>
                            {i.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
