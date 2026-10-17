"use client";

import { use } from "react";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { useStaffSession } from "@/hooks/use-staff-session";

export default function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useStaffSession(`/admin/products/${id}`);

  return (
    <AdminShell active="products">
      <div className="max-w-4xl">
        {token ? <ProductEditor token={token} productId={id} /> : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </AdminShell>
  );
}
