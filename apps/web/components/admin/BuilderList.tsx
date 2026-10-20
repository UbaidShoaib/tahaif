"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildersAdminApi, type AdminBuilderSummary } from "@/lib/builders-admin";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

/**
 * Every build-your-own hamper and bouquet, with how many items buyers can add and
 * how many buckets have been started. To make a new one, open any product (often a
 * new "Build your own…" product with the basket's price) and use its Build-your-own section.
 */
export function BuilderList({ token }: { token: string }) {
  const [builders, setBuilders] = useState<AdminBuilderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    buildersAdminApi
      .list(token)
      .then(setBuilders)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.detail : "Could not load builders."));
  }, [token]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">How to set one up</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Add a product for the empty basket or wrap (Add product), priced at what the container costs, and add its photo and delivery cities.</li>
          <li>Add the items as products of the same shop. Single stems or ribbons can stay hidden from the shop.</li>
          <li>Open the basket product, set <em>Build-your-own</em> to Hamper or Bouquet, and add the items with how many each bucket may hold.</li>
          <li>Publish the basket product. Buyers start at <code>/build/&lt;product URL name&gt;</code>; it also appears under “Build your own” on the home page.</li>
        </ol>
      </div>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!builders && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {builders?.length === 0 && <p className="text-sm text-muted-foreground">No builders yet.</p>}

      {builders && builders.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {builders.map((b) => (
            <li key={b.product_id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.name}</p>
                <p className="text-sm text-muted-foreground">
                  {b.vendor_name} · {b.builder_kind === "bouquet" ? "Bouquet" : "Hamper"} · from {formatPrice(b.base_price_pkr)} ·{" "}
                  {b.min_items}–{b.max_items ?? "any"} items · {b.bucket_count} started
                </p>
              </div>
              {!b.is_active && <Badge variant="neutral">Hidden</Badge>}
              {b.component_count === 0 ? (
                <Badge variant="warning">No items yet</Badge>
              ) : (
                <Badge variant="neutral">{b.component_count} items</Badge>
              )}
              <Link href={`/admin/products/${b.product_id}`} className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                <Pencil aria-hidden className="h-3 w-3" /> Edit
              </Link>
              {b.is_active && b.component_count > 0 && (
                <Link href={`/build/${b.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                  Open <ExternalLink aria-hidden className="h-3 w-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
