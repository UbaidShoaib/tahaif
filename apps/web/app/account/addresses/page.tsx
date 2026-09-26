"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { accountApi, type AddressRead, type AddressWrite } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type City = { id: string; name: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const EMPTY: AddressWrite = {
  recipient_name: "",
  recipient_phone: "",
  line1: "",
  line2: "",
  city_name: "",
  landmark: "",
  is_default: false,
};

function toForm(a: AddressRead): AddressWrite {
  return {
    recipient_name: a.recipient_name,
    recipient_phone: a.recipient_phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    city_name: a.city_name,
    landmark: a.landmark ?? "",
    is_default: a.is_default,
  };
}

export default function AddressesPage() {
  const { accessToken, isLoading } = useAuthStore();
  const [addresses, setAddresses] = useState<AddressRead[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // null = form closed, "new" = adding, otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AddressWrite>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async (token: string) => {
    try {
      setAddresses(await accountApi.listAddresses(token));
    } catch {
      setError("Could not load your addresses. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!accessToken) { setLoading(false); return; }
    void load(accessToken);
    fetch(`${API_BASE}/cities`)
      .then((r) => (r.ok ? (r.json() as Promise<City[]>) : []))
      .then(setCities)
      .catch(() => setCities([]));
  }, [accessToken, isLoading, load]);

  if (isLoading || loading) {
    return <p className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading addresses…</p>;
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">Addresses</h1>
        <p className="text-muted-foreground mb-6">Sign in to manage your saved recipients.</p>
        <Button asChild><Link href="/login?callbackUrl=%2Faccount%2Faddresses">Sign in</Link></Button>
      </div>
    );
  }

  const set = (key: keyof AddressWrite, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const canSave = form.recipient_name.trim() && form.recipient_phone.trim() && form.line1.trim() && form.city_name;

  const open = (a: AddressRead | null) => {
    setError(null);
    setEditing(a ? a.id : "new");
    setForm(a ? toForm(a) : { ...EMPTY, is_default: addresses.length === 0 });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body: AddressWrite = {
      ...form,
      recipient_name: form.recipient_name.trim(),
      recipient_phone: form.recipient_phone.trim(),
      line1: form.line1.trim(),
      line2: form.line2?.trim() ?? "",
      landmark: form.landmark?.trim() ?? "",
    };
    try {
      if (editing === "new") await accountApi.createAddress(body, accessToken);
      else if (editing) await accountApi.updateAddress(editing, body, accessToken);
      setEditing(null);
      await load(accessToken);
    } catch {
      setError("Could not save this address. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (id: string) => {
    setError(null);
    try {
      await accountApi.updateAddress(id, { is_default: true }, accessToken);
      await load(accessToken);
    } catch {
      setError("Could not change your default address.");
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await accountApi.deleteAddress(id, accessToken);
      setConfirmDelete(null);
      await load(accessToken);
    } catch {
      setError("Could not delete this address.");
    }
  };

  // Keep a saved city selectable even if it is no longer in the delivery list.
  const cityNames = cities.map((c) => c.name);
  if (form.city_name && !cityNames.includes(form.city_name)) cityNames.unshift(form.city_name);

  const formView = (
    <form onSubmit={(e) => { void save(e); }} className="rounded-xl border p-5 space-y-4" aria-label="Address form">
      <h2 className="font-semibold text-lg">{editing === "new" ? "Add a recipient" : "Edit address"}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="addr-name">Recipient name *</Label>
          <Input id="addr-name" value={form.recipient_name} maxLength={255} onChange={(e) => set("recipient_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addr-phone">Recipient phone *</Label>
          <Input id="addr-phone" type="tel" value={form.recipient_phone} maxLength={30} placeholder="+92 300 1234567" onChange={(e) => set("recipient_phone", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="addr-line1">Address *</Label>
        <Input id="addr-line1" value={form.line1} placeholder="House/flat, street, area" onChange={(e) => set("line1", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="addr-line2">Apartment / floor</Label>
          <Input id="addr-line2" value={form.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addr-city">City *</Label>
          <select
            id="addr-city"
            value={form.city_name}
            onChange={(e) => set("city_name", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select city…</option>
            {cityNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="addr-landmark">Nearby landmark</Label>
        <Input id="addr-landmark" value={form.landmark ?? ""} placeholder="e.g. Near Liberty Market" onChange={(e) => set("landmark", e.target.value)} />
      </div>
      <label htmlFor="addr-default" className="flex items-center gap-2 text-sm">
        <input id="addr-default" type="checkbox" checked={!!form.is_default} onChange={(e) => set("is_default", e.target.checked)} className="h-4 w-4 accent-primary-700" />
        Use as my default address at checkout
      </label>
      <div className="flex gap-3">
        <Button type="submit" disabled={!canSave || saving}>{saving ? "Saving…" : "Save address"}</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
      </div>
    </form>
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Addresses</h1>
          <p className="text-sm text-muted-foreground">Saved recipients appear at checkout so you can send again in one tap.</p>
        </div>
        {editing === null && (
          <Button type="button" onClick={() => open(null)} className="gap-2"><Plus className="h-4 w-4" /> Add address</Button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {editing === "new" && formView}

      {addresses.length === 0 && editing === null ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <MapPin className="mx-auto mb-3 h-8 w-8" aria-hidden />
          <p>No saved addresses yet. Add your family&apos;s addresses to check out faster.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li key={a.id}>
              {editing === a.id ? formView : (
                <div className="rounded-xl border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5 text-sm">
                      <p className="font-medium text-base">
                        {a.recipient_name}
                        {a.is_default && (
                          <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">Default</span>
                        )}
                      </p>
                      <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
                      <p>{a.city_name}{a.landmark ? ` · ${a.landmark}` : ""}</p>
                      <p className="text-muted-foreground">{a.recipient_phone}</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {!a.is_default && (
                        <button type="button" onClick={() => { void makeDefault(a.id); }} className="text-primary-700 dark:text-primary-300 hover:underline">Make default</button>
                      )}
                      <button type="button" onClick={() => open(a)} className="text-primary-700 dark:text-primary-300 hover:underline">Edit</button>
                      <button type="button" onClick={() => setConfirmDelete(a.id)} className="text-muted-foreground hover:text-destructive">Delete</button>
                    </div>
                  </div>
                  {confirmDelete === a.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
                      <span>Delete {a.recipient_name}&apos;s address?</span>
                      <Button type="button" size="sm" variant="destructive" onClick={() => { void remove(a.id); }}>Delete</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Keep</Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
