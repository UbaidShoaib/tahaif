/** Admin API for cities and categories. Create and edit use the catalog routes (staff only). */
import { apiFetch } from "@/lib/api";

export type AdminCity = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
  vendor_count: number;
  product_count: number;
  delivery_count: number;
};

export type AdminCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  child_count: number;
};

export const DEFAULT_TIMEZONE = "Asia/Karachi";

export const citiesAdminApi = {
  list: (token: string) => apiFetch<AdminCity[]>("/admin/cities", { token }),
  create: (token: string, body: { name: string; slug: string; timezone: string }) =>
    apiFetch<AdminCity>("/cities", { method: "POST", token, body }),
  update: (token: string, slug: string, body: Partial<Pick<AdminCity, "name" | "timezone" | "is_active">>) =>
    apiFetch<AdminCity>(`/cities/${slug}`, { method: "PATCH", token, body }),
  remove: (token: string, id: string) => apiFetch<void>(`/admin/cities/${id}`, { method: "DELETE", token }),
};

export const categoriesAdminApi = {
  list: (token: string) => apiFetch<AdminCategory[]>("/admin/categories", { token }),
  create: (token: string, body: { name: string; slug: string; parent_id: string | null; sort_order: number }) =>
    apiFetch<AdminCategory>("/categories", { method: "POST", token, body }),
  update: (
    token: string,
    slug: string,
    body: Partial<Pick<AdminCategory, "name" | "parent_id" | "sort_order" | "is_active">>,
  ) => apiFetch<AdminCategory>(`/categories/${slug}`, { method: "PATCH", token, body }),
  remove: (token: string, id: string) => apiFetch<void>(`/admin/categories/${id}`, { method: "DELETE", token }),
};

/** Top-level categories, each followed by its subcategories: the order the store menu uses. */
export function nestCategories<T extends { id: string; parent_id: string | null }>(all: T[]): (T & { depth: 0 | 1 })[] {
  const out: (T & { depth: 0 | 1 })[] = [];
  const ids = new Set(all.map((c) => c.id));
  for (const root of all.filter((c) => !c.parent_id || !ids.has(c.parent_id))) {
    out.push({ ...root, depth: 0 });
    for (const child of all.filter((c) => c.parent_id === root.id)) out.push({ ...child, depth: 1 });
  }
  return out;
}

type MenuCategory = { id: string; name: string; children?: MenuCategory[] };

/** The store menu (top level with children) as one pick list, subcategories as "Parent › Child". */
export function categoryOptions(menu: MenuCategory[]): { id: string; name: string }[] {
  return menu.flatMap((c) => [
    { id: c.id, name: c.name },
    ...(c.children ?? []).map((ch) => ({ id: ch.id, name: `${c.name} › ${ch.name}` })),
  ]);
}
