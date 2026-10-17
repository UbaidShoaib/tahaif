"use client";

import { use } from "react";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { useStaffSession } from "@/hooks/use-staff-session";

export default function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useStaffSession(`/admin/products/${id}`);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {token ? <ProductEditor token={token} productId={id} /> : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
