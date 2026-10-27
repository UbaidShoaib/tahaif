/** Admin API for build-your-own builders (ADR 0014). */
import { apiFetch } from "@/lib/api";

export type BuilderKind = "hamper" | "bouquet";
export type ComponentRole = "item" | "stem" | "filler" | "wrap" | "ribbon";

export const ROLE_OPTIONS: { value: ComponentRole; label: string }[] = [
  { value: "item", label: "Gift" },
  { value: "stem", label: "Flower stem" },
  { value: "filler", label: "Filler" },
  { value: "wrap", label: "Wrapping" },
  { value: "ribbon", label: "Ribbon" },
];

export type AdminBuilderComponent = {
  id: string;
  component_product_id: string;
  name: string;
  slug: string;
  image: string | null;
  price_pkr: number;
  product_is_active: boolean;
  role: ComponentRole;
  max_qty: number;
  sort_order: number;
  is_active: boolean;
};

export type AdminBuilderConfig = {
  product_id: string;
  vendor_id: string;
  builder_kind: BuilderKind | null;
  min_items: number;
  max_items: number | null;
  components: AdminBuilderComponent[];
};

export type AdminBuilderSummary = {
  product_id: string;
  name: string;
  slug: string;
  vendor_name: string;
  builder_kind: BuilderKind;
  is_active: boolean;
  base_price_pkr: number;
  min_items: number;
  max_items: number | null;
  component_count: number;
  bucket_count: number;
};

const base = (productId: string) => `/admin/products/${productId}/builder`;

export const buildersAdminApi = {
  list: (token: string) => apiFetch<AdminBuilderSummary[]>("/admin/builders", { token }),
  get: (token: string, productId: string) => apiFetch<AdminBuilderConfig>(base(productId), { token }),
  saveSettings: (
    token: string,
    productId: string,
    body: { builder_kind: BuilderKind | null; min_items: number; max_items: number | null },
  ) => apiFetch<AdminBuilderConfig>(base(productId), { method: "PUT", token, body }),
  addComponent: (token: string, productId: string, body: { component_product_id: string; role: ComponentRole; max_qty: number }) =>
    apiFetch<AdminBuilderConfig>(`${base(productId)}/components`, { method: "POST", token, body }),
  updateComponent: (
    token: string,
    productId: string,
    componentId: string,
    body: Partial<Pick<AdminBuilderComponent, "role" | "max_qty" | "sort_order" | "is_active">>,
  ) => apiFetch<AdminBuilderConfig>(`${base(productId)}/components/${componentId}`, { method: "PATCH", token, body }),
  removeComponent: (token: string, productId: string, componentId: string) =>
    apiFetch<AdminBuilderConfig>(`${base(productId)}/components/${componentId}`, { method: "DELETE", token }),
};

/** A whole number in range from a text box; null when it isn't one. */
export function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= min && n <= max ? n : null;
}

/** Move one item up or down: the new sort_order for both rows that swap. */
export function swapOrder(
  components: AdminBuilderComponent[],
  id: string,
  direction: -1 | 1,
): { id: string; sort_order: number }[] {
  const list = [...components].sort((a, b) => a.sort_order - b.sort_order);
  const i = list.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return [];
  // Rewrite as 0..n-1 so equal or gapped orders still swap cleanly.
  return [
    { id: list[i].id, sort_order: j },
    { id: list[j].id, sort_order: i },
  ];
}
