"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { slugify } from "@/components/admin/AddProductForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { citiesAdminApi, DEFAULT_TIMEZONE, type AdminCity } from "@/lib/taxonomy-admin";

const message = (e: unknown) => (e instanceof ApiError ? e.detail : "Something went wrong. Try again.");

/**
 * Cities buyers can send to. Switching one off hides it from the store and stops new
 * orders there; only a city no shop, product or delivery has used can be deleted.
 */
export function CityManager({ token }: { token: string }) {
  const [cities, setCities] = useState<AdminCity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => citiesAdminApi.list(token).then(setCities), [token]);

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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter the city name.");
    if (!/^[a-z0-9-]+$/.test(slug)) return setError("The URL name may only use a–z, 0–9 and hyphens.");
    const added = await run(
      () => citiesAdminApi.create(token, { name: name.trim(), slug, timezone: timezone.trim() || DEFAULT_TIMEZONE }),
      `${name.trim()} added.`,
    );
    if (added) {
      setName(""); setSlug(""); setSlugEdited(false); setTimezone(DEFAULT_TIMEZONE);
    }
  }

  function startEdit(c: AdminCity) {
    setEditing(c.id);
    setEditName(c.name);
    setEditTimezone(c.timezone);
    setConfirmDelete(null);
  }

  async function saveEdit(c: AdminCity) {
    if (!editName.trim()) return setError("Enter the city name.");
    const saved = await run(
      () => citiesAdminApi.update(token, c.slug, { name: editName.trim(), timezone: editTimezone.trim() }),
      "City saved.",
    );
    if (saved) setEditing(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void add(e)} aria-labelledby="add-city-heading" className="space-y-4 rounded-xl border p-4" noValidate>
        <h2 id="add-city-heading" className="font-semibold">Add a city</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="City name" required>
            {(p) => (
              <Input {...p} value={name} maxLength={100}
                onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} />
            )}
          </FormField>
          <FormField label="URL name" required hint="Used in links; can't be changed later.">
            {(p) => (
              <Input {...p} value={slug} maxLength={100}
                onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />
            )}
          </FormField>
          <FormField label="Time zone" hint="Same-day cut-offs use this clock.">
            {(p) => <Input {...p} value={timezone} maxLength={64} onChange={(e) => setTimezone(e.target.value)} />}
          </FormField>
        </div>
        <Button type="submit" className="gap-1" disabled={busy}>
          <Plus aria-hidden className="h-4 w-4" /> Add city
        </Button>
      </form>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {ok && <p role="status" className="text-sm text-success-foreground">{ok}</p>}

      {!cities && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {cities?.length === 0 && <p className="text-sm text-muted-foreground">No cities yet.</p>}
      {cities && cities.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {cities.map((c) => {
            const inUse = c.vendor_count + c.product_count + c.delivery_count > 0;
            return (
              <li key={c.id} className="space-y-3 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      /{c.slug} · {c.timezone} · {c.vendor_count} shops · {c.product_count} products · {c.delivery_count} deliveries
                    </p>
                  </div>
                  {!c.is_active && <Badge variant="neutral">Switched off</Badge>}
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => startEdit(c)} disabled={busy} aria-label={`Edit ${c.name}`}>
                    <Pencil aria-hidden className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy}
                    aria-label={`${c.is_active ? "Switch off" : "Switch on"} ${c.name}`}
                    onClick={() => void run(() => citiesAdminApi.update(token, c.slug, { is_active: !c.is_active }),
                      c.is_active ? `${c.name} switched off — no new orders there.` : `${c.name} is open for orders.`)}>
                    {c.is_active ? <EyeOff aria-hidden className="h-3 w-3" /> : <Eye aria-hidden className="h-3 w-3" />}
                    {c.is_active ? "Switch off" : "Switch on"}
                  </Button>
                  {!inUse && (confirmDelete === c.id ? (
                    <Button size="sm" variant="destructive" disabled={busy} aria-label={`Confirm delete ${c.name}`}
                      onClick={() => void run(() => citiesAdminApi.remove(token, c.id), `${c.name} deleted.`)}>
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
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <FormField label="City name">
                      {(p) => <Input {...p} value={editName} maxLength={100} onChange={(e) => setEditName(e.target.value)} />}
                    </FormField>
                    <FormField label="Time zone">
                      {(p) => <Input {...p} value={editTimezone} maxLength={64} onChange={(e) => setEditTimezone(e.target.value)} />}
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
