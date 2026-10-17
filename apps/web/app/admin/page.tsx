"use client";

import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { AddProductForm } from "@/components/admin/AddProductForm";
import { ProductList } from "@/components/admin/ProductList";
import { VendorApplications } from "@/components/admin/VendorApplications";
import { NoteReports } from "@/components/admin/NoteReports";
import { AssistedOrderForm } from "@/components/admin/AssistedOrderForm";
import { MessageQueue } from "@/components/admin/MessageQueue";
import { CampaignReport } from "@/components/admin/CampaignReport";
import { OrderList } from "@/components/admin/OrderList";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { Button } from "@/components/ui/button";
import { useStaffSession } from "@/hooks/use-staff-session";
import { useAuthStore } from "@/stores/auth.store";

type Section =
  | "orders" | "new-order" | "messages" | "campaigns" | "applications" | "add-product" | "products" | "note-reports"
  | "activity";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "new-order", label: "New DM order" },
  { key: "messages", label: "Messages to send" },
  { key: "campaigns", label: "Sales by campaign" },
  { key: "applications", label: "Shop applications" },
  { key: "products", label: "Products" },
  { key: "add-product", label: "Add product" },
  { key: "note-reports", label: "Reported notes" },
];

// Shows every staff member's actions and IPs, so admins only (the API enforces it too).
const ADMIN_SECTIONS: { key: Section; label: string }[] = [{ key: "activity", label: "Activity" }];

export default function AdminDashboard() {
  const token = useStaffSession("/admin");
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [section, setSection] = useState<Section>("orders");
  const sections = isAdmin ? [...SECTIONS, ...ADMIN_SECTIONS] : SECTIONS;

  // Other admin pages link back to a tab with ?section=…
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("section");
    if (sections.some((s) => s.key === wanted)) setSection(wanted as Section);
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-link" />
          Admin Dashboard
        </h1>
      </div>

      <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-2 border-b pb-3">
        {sections.map((s) => (
          <Button
            key={s.key}
            variant={section === s.key ? "default" : "ghost"}
            size="sm"
            aria-current={section === s.key ? "page" : undefined}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </nav>

      {token && (
        <>
          {section === "orders" && <OrderList token={token} />}
          {section === "applications" && <VendorApplications token={token} />}
          {section === "add-product" && <AddProductForm token={token} />}
          {section === "products" && <ProductList token={token} />}
          {section === "note-reports" && <NoteReports token={token} />}
          {section === "new-order" && <AssistedOrderForm token={token} />}
          {section === "messages" && <MessageQueue token={token} />}
          {section === "campaigns" && <CampaignReport token={token} />}
          {section === "activity" && isAdmin && <ActivityLog token={token} />}
        </>
      )}
    </div>
  );
}
