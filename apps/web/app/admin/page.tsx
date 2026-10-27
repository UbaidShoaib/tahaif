"use client";

import { useState, useEffect } from "react";
import { AddProductForm } from "@/components/admin/AddProductForm";
import { AdminShell, NAV, visibleSections, type Section } from "@/components/admin/AdminShell";
import { ProductList } from "@/components/admin/ProductList";
import { VendorApplications } from "@/components/admin/VendorApplications";
import { NoteReports } from "@/components/admin/NoteReports";
import { AssistedOrderForm } from "@/components/admin/AssistedOrderForm";
import { MessageQueue } from "@/components/admin/MessageQueue";
import { CampaignReport } from "@/components/admin/CampaignReport";
import { OrderList } from "@/components/admin/OrderList";
import { AttentionInbox } from "@/components/admin/AttentionInbox";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { BuilderList } from "@/components/admin/BuilderList";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { CityManager } from "@/components/admin/CityManager";
import { useStaffSession } from "@/hooks/use-staff-session";
import { useAuthStore } from "@/stores/auth.store";

const LABELS = Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.key, i.label])) as Record<Section, string>;

export default function AdminDashboard() {
  const token = useStaffSession("/admin");
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [section, setSection] = useState<Section>("attention");

  // The section lives in ?section=… so links from other admin pages, refresh and
  // the browser's back button all land on the right one.
  useEffect(() => {
    const fromUrl = () => {
      const wanted = new URLSearchParams(window.location.search).get("section");
      const known = visibleSections(isAdmin).some((s) => s.key === wanted);
      setSection(known ? (wanted as Section) : "attention");
    };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, [isAdmin]);

  const select = (s: Section) => {
    if (s === section) return;
    setSection(s);
    window.history.pushState(null, "", s === "attention" ? "/admin" : `/admin?section=${s}`);
  };

  return (
    <AdminShell active={section} onSelect={select}>
      <h1 className="mb-6 text-2xl font-bold">{LABELS[section]}</h1>
      {token && (
        <>
          {section === "attention" && <AttentionInbox token={token} />}
          {section === "orders" && <OrderList token={token} />}
          {section === "applications" && <VendorApplications token={token} />}
          {section === "add-product" && <AddProductForm token={token} />}
          {section === "products" && <ProductList token={token} />}
          {section === "builders" && <BuilderList token={token} />}
          {section === "categories" && <CategoryManager token={token} />}
          {section === "cities" && <CityManager token={token} />}
          {section === "note-reports" && <NoteReports token={token} />}
          {section === "new-order" && <AssistedOrderForm token={token} />}
          {section === "messages" && <MessageQueue token={token} />}
          {section === "campaigns" && <CampaignReport token={token} />}
          {section === "activity" && isAdmin && <ActivityLog token={token} />}
        </>
      )}
    </AdminShell>
  );
}
