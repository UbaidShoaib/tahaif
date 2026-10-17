"use client";

import { use } from "react";
import { OrderDetail } from "@/components/admin/OrderDetail";
import { useStaffSession } from "@/hooks/use-staff-session";

export default function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useStaffSession(`/admin/orders/${id}`);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {token ? <OrderDetail token={token} orderId={id} /> : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
