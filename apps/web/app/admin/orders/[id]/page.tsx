"use client";

import { use } from "react";
import { OrderDetail } from "@/components/admin/OrderDetail";
import { AdminShell } from "@/components/admin/AdminShell";
import { useStaffSession } from "@/hooks/use-staff-session";

export default function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useStaffSession(`/admin/orders/${id}`);

  return (
    <AdminShell active="orders">
      <div className="max-w-6xl">
        {token ? <OrderDetail token={token} orderId={id} /> : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </AdminShell>
  );
}
