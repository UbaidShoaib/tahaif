"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { slugify } from "@/components/admin/AddProductForm";
import { ActionNotices, errorText, useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { dayToInstant, instantToDay, occasionsApi, type AdminOccasion, type OccasionWrite } from "@/lib/back-office-admin";

type Draft = { name: string; nameUr: string; banner: string; starts: string; ends: string; order: string };

const EMPTY: Draft = { name: "", nameUr: "", banner: "", starts: "", ends: "", order: "0" };

const toDraft = (o: AdminOccasion): Draft => ({
  name: o.name, nameUr: o.name_ur ?? "", banner: o.banner_url ?? "",
  starts: instantToDay(o.starts_at), ends: instantToDay(o.ends_at), order: String(o.sort_order),
});

function fromDraft(d: Draft): OccasionWrite | string {
  if (!d.name.trim()) return "Enter the occasion's name.";
  if (!/^-?\d+$/.test(d.order.trim() || "0")) return "Menu position must be a whole number.";
  if (d.banner.trim() && !/^https?:\/\//.test(d.banner.trim())) return "The banner must be a web link starting with https://.";
  if (d.starts && d.ends && d.ends < d.starts) return "The last day can't be before the first.";
  return {
    name: d.name.trim(), name_ur: d.nameUr.trim() || null, banner_url: d.banner.trim() || null,
    starts_at: dayToInstant(d.starts), ends_at: dayToInstant(d.ends, true), sort_order: Number(d.order.trim() || "0"),
  };
}

function DraftFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <FormField label="Urdu name">
        {(p) => <Input {...p} dir="rtl" lang="ur" value={draft.nameUr} maxLength={100} onChange={(e) => set({ nameUr: e.target.value })} />}
      </FormField>
      <FormField label="Banner image link" className="sm:col-span-2" hint="Wide photo shown at the top of the page.">
        {(p) => <Input {...p} type="url" value={draft.banner} onChange={(e) => set({ banner: e.target.value })} />}
      </FormField>
      <FormField label="First day" hint="Pakistan time. Used for reminders and the home page.">
        {(p) => <Input {...p} type="date" value={draft.starts} onChange={(e) => set({ starts: e.target.value })} />}
      </FormField>
      <FormField label="Last day">
        {(p) => <Input {...p} type="date" value={draft.ends} onChange={(e) => set({ ends: e.target.value })} />}
      </FormField>
      <FormField label="Menu position" hint="Lower numbers come first.">
        {(p) => <Input {...p} inputMode="numeric" value={draft.order} onChange={(e) => set({ order: e.target.value })} />}
      </FormField>
    </div>
  );
}

/**
 * Occasion pages (Eid, Mother's Day…). Products are put on an occasion from the product editor;
 * switching one off hides its page and takes it out of the store.
 */
export function OccasionManager({ token }: { token: string }) {
  const [occasions, setOccasions] = useState<AdminOccasion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);

  const load = useCallback(() => occasionsApi.list(token).then(setOccasions), [token]);
  const { busy, error, ok, run, fail } = useAdminAction(load);

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)));
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = fromDraft(draft);
    if (typeof body === "string") return fail(body);
    if (!/^[a-z0-9-]+$/.test(slug)) return fail("The URL name may only use a–z, 0–9 and hyphens.");
    if (await run(() => occasionsApi.create(token, { ...body, slug }), `${body.name} added.`)) {
      setDraft(EMPTY); setSlug(""); setSlugEdited(false);
    }
  }

  async function save(o: AdminOccasion) {
    const body = fromDraft(editDraft);
    if (typeof body === "string") return fail(body);
    if (await run(() => occasionsApi.update(token, o.id, body), `${body.name} saved.`)) setEditing(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void add(e)} aria-labelledby="add-occasion-heading" className="space-y-4 rounded-xl border p-4" noValidate>
        <h2 id="add-occasion-heading" className="font-semibold">Add an occasion</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" required>
            {(p) => (
              <Input {...p} value={draft.name} maxLength={100}
                onChange={(e) => { setDraft({ ...draft, name: e.target.value }); if (!slugEdited) setSlug(slugify(e.target.value)); }} />
            )}
          </FormField>
          <FormField label="URL name" required hint={`Shown as /occasion/${slug || "…"}; can't be changed later.`}>
            {(p) => <Input {...p} value={slug} maxLength={100} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />}
          </FormField>
        </div>
        <DraftFields draft={draft} onChange={setDraft} />
        <Button type="submit" className="gap-1" disabled={busy}>
          <Plus aria-hidden className="h-4 w-4" /> Add occasion
        </Button>
      </form>

      <ActionNotices error={error ?? loadError} ok={ok} />

      {!occasions && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
      {occasions?.length === 0 && <p className="text-sm text-muted-foreground">No occasions yet.</p>}
      {occasions && occasions.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {occasions.map((o) => (
            <li key={o.id} className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.name}
                    {o.name_ur && <span lang="ur" dir="rtl" className="ms-2 text-muted-foreground">{o.name_ur}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    /occasion/{o.slug} · {o.product_count} products
                    {(o.starts_at || o.ends_at) && ` · ${instantToDay(o.starts_at) || "…"} to ${instantToDay(o.ends_at) || "…"}`}
                  </p>
                </div>
                {!o.is_active && <Badge variant="neutral">Hidden</Badge>}
                {o.is_active && (
                  <a href={`/occasion/${o.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                    View <ExternalLink aria-hidden className="h-3 w-3" />
                  </a>
                )}
                <Button size="sm" variant="ghost" className="gap-1" disabled={busy} aria-label={`Edit ${o.name}`}
                  onClick={() => { setEditing(o.id); setEditDraft(toDraft(o)); }}>
                  <Pencil aria-hidden className="h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={busy} aria-label={`${o.is_active ? "Hide" : "Show"} ${o.name}`}
                  onClick={() => void run(() => occasionsApi.update(token, o.id, { is_active: !o.is_active }),
                    o.is_active ? `${o.name} hidden.` : `${o.name} is live.`)}>
                  {o.is_active ? "Hide" : "Show"}
                </Button>
              </div>
              {editing === o.id && (
                <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                  <FormField label="Name" className="max-w-sm">
                    {(p) => <Input {...p} value={editDraft.name} maxLength={100} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />}
                  </FormField>
                  <DraftFields draft={editDraft} onChange={setEditDraft} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void save(o)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
