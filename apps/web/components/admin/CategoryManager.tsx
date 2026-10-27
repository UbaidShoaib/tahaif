"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { slugify } from "@/components/admin/AddProductForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { categoriesAdminApi, nestCategories, type AdminCategory } from "@/lib/taxonomy-admin";

const message = (e: unknown) => (e instanceof ApiError ? e.detail : "Something went wrong. Try again.");

/** A whole number for the menu position; blank counts as 0. */
function sortOrder(text: string): number | null {
  if (!text.trim()) return 0;
  return /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * The store's categories, two levels deep as the menu shows them. Switching one off hides
 * it from the menu; only a category with no products and no subcategories can be deleted.
 */
export function CategoryManager({ token }: { token: string }) {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [parentId, setParentId] = useState("");
  const [order, setOrder] = useState("0");

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParent, setEditParent] = useState("");
  const [editOrder, setEditOrder] = useState("0");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => categoriesAdminApi.list(token).then(setCategories), [token]);

  useEffect(() => {
    load().catch((e: unknown) => setError(message(e)));
  }, [load]);

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await work();
      await load();
      setOk(done);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const topLevel = (categories ?? []).filter((c) => !c.parent_id);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const position = sortOrder(order);
    if (!name.trim()) return setError("Enter the category name.");
    if (!/^[a-z0-9-]+$/.test(slug)) return setError("The URL name may only use a–z, 0–9 and hyphens.");
    if (position === null) return setError("Menu position must be a whole number.");
    const added = await run(
      () => categoriesAdminApi.create(token, { name: name.trim(), slug, parent_id: parentId || null, sort_order: position }),
      `${name.trim()} added.`,
    );
    if (added) {
      setName(""); setSlug(""); setSlugEdited(false); setParentId(""); setOrder("0");
    }
  }

  function startEdit(c: AdminCategory) {
    setEditing(c.id);
    setEditName(c.name);
    setEditParent(c.parent_id ?? "");
    setEditOrder(String(c.sort_order));
    setConfirmDelete(null);
  }

  async function saveEdit(c: AdminCategory) {
    const position = sortOrder(editOrder);
    if (!editName.trim()) return setError("Enter the category name.");
    if (position === null) return setError("Menu position must be a whole number.");
    const saved = await run(
      () => categoriesAdminApi.update(token, c.slug, { name: editName.trim(), parent_id: editParent || null, sort_order: position }),
      "Category saved.",
    );
    if (saved) setEditing(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void add(e)} aria-labelledby="add-category-heading" className="space-y-4 rounded-xl border p-4" noValidate>
        <h2 id="add-category-heading" className="font-semibold">Add a category</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Category name" required>
            {(p) => (
              <Input {...p} value={name} maxLength={100}
                onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} />
            )}
          </FormField>
          <FormField label="URL name" required hint={`Shown as /c/${slug || "…"}; can't be changed later.`}>
            {(p) => (
              <Input {...p} value={slug} maxLength={100}
                onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />
            )}
          </FormField>
          <FormField label="Parent" hint="Leave as top level, or file it under another category.">
            {(p) => (
              <Select {...p} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Top level</option>
                {topLevel.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </FormField>
          <FormField label="Menu position" hint="Lower numbers come first.">
            {(p) => <Input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />}
          </FormField>
        </div>
        <Button type="submit" className="gap-1" disabled={busy}>
          <Plus aria-hidden className="h-4 w-4" /> Add category
        </Button>
      </form>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {ok && <p role="status" className="text-sm text-success-foreground">{ok}</p>}

      {!categories && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {categories?.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      {categories && categories.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {nestCategories(categories).map((c) => {
            const empty = c.product_count === 0 && c.child_count === 0;
            // A category with subcategories stays top level; others can move under any other top-level one.
            const parents = c.child_count > 0 ? [] : topLevel.filter((t) => t.id !== c.id);
            return (
              <li key={c.id} className={cn("space-y-3 p-3", c.depth === 1 && "pl-8")}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.depth === 1 && <span aria-hidden className="text-muted-foreground">↳ </span>}{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      /c/{c.slug} · position {c.sort_order} · {c.product_count} products
                      {c.depth === 0 && ` · ${c.child_count} subcategories`}
                    </p>
                  </div>
                  {!c.is_active && <Badge variant="neutral">Hidden</Badge>}
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => startEdit(c)} disabled={busy} aria-label={`Edit ${c.name}`}>
                    <Pencil aria-hidden className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy}
                    aria-label={`${c.is_active ? "Hide" : "Show"} ${c.name}`}
                    onClick={() => void run(() => categoriesAdminApi.update(token, c.slug, { is_active: !c.is_active }),
                      c.is_active ? `${c.name} hidden from the store menu.` : `${c.name} is in the store menu.`)}>
                    {c.is_active ? <EyeOff aria-hidden className="h-3 w-3" /> : <Eye aria-hidden className="h-3 w-3" />}
                    {c.is_active ? "Hide" : "Show"}
                  </Button>
                  {empty && (confirmDelete === c.id ? (
                    <Button size="sm" variant="destructive" disabled={busy} aria-label={`Confirm delete ${c.name}`}
                      onClick={() => void run(() => categoriesAdminApi.remove(token, c.id), `${c.name} deleted.`)}>
                      Confirm delete
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={busy} aria-label={`Delete ${c.name}`}
                      onClick={() => setConfirmDelete(c.id)}>
                      <Trash2 aria-hidden className="h-3 w-3" /> Delete
                    </Button>
                  ))}
                </div>
                {editing === c.id && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
                    <FormField label="Category name">
                      {(p) => <Input {...p} value={editName} maxLength={100} onChange={(e) => setEditName(e.target.value)} />}
                    </FormField>
                    <FormField label="Parent">
                      {(p) => (
                        <Select {...p} value={editParent} onChange={(e) => setEditParent(e.target.value)}>
                          <option value="">Top level</option>
                          {parents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                      )}
                    </FormField>
                    <FormField label="Menu position">
                      {(p) => <Input {...p} inputMode="numeric" value={editOrder} onChange={(e) => setEditOrder(e.target.value)} />}
                    </FormField>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => void saveEdit(c)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
