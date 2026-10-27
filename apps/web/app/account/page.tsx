"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSessionMarker } from "@/lib/session";
import { MapPin, Package, Star, Download, Trash2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useCurrencyStore } from "@/stores/currency.store";
import { COUNTRIES, accountApi, SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandSlug } from "@/lib/brand";
import { PeopleDashboard } from "@/components/account/PeopleDashboard";

const CONFIRM_WORD = "DELETE";

export default function AccountPage() {
  const router = useRouter();
  const { user, accessToken, isLoading, setSession, clearSession } = useAuthStore();
  const rates = useCurrencyStore((s) => s.rates);
  const syncFromUser = useCurrencyStore((s) => s.syncFromUser);

  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("PKR");
  const [country, setCountry] = useState("");
  const [reminders, setReminders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setCountry(user.country ?? "");
    setReminders(user.occasion_reminders ?? true);
    setCurrency((SUPPORTED_CURRENCIES as readonly string[]).includes(user.currency_pref)
      ? (user.currency_pref as CurrencyCode)
      : "PKR");
  }, [user]);

  if (isLoading) {
    return <p className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading your account…</p>;
  }

  if (!user || !accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">My Account</h1>
        <p className="text-muted-foreground mb-6">Sign in to manage your profile, orders and addresses.</p>
        <Button asChild><Link href="/login?callbackUrl=%2Faccount">Sign in</Link></Button>
      </div>
    );
  }

  // Currencies we can price in right now, plus the one already saved.
  const currencyOptions = SUPPORTED_CURRENCIES.filter((c) => rates[c] || c === currency);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await accountApi.updateMe(
        {
          full_name: fullName.trim() || null,
          currency_pref: currency,
          ...(country ? { country } : {}),
          occasion_reminders: reminders,
        },
        accessToken,
      );
      setSession(updated, accessToken);
      syncFromUser(updated.currency_pref);
      setSaved(true);
    } catch {
      setError("Could not save your details. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const downloadData = async () => {
    setExporting(true);
    setError(null);
    try {
      const data = await accountApi.exportData(accessToken);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${brandSlug()}-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not prepare your data export. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await accountApi.deleteAccount(accessToken);
      clearSessionMarker();
      clearSession();
      router.push("/");
    } catch {
      setError("Could not delete your account. Try again or contact support.");
      setDeleting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-10 px-4 py-8">
      <PeopleDashboard token={accessToken} firstName={user.full_name?.trim().split(/\s+/)[0] || null} />

      <div className="max-w-2xl space-y-8 border-t pt-8">
      <div>
        <h2 className="font-display text-xl">Settings</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <nav aria-label="Account sections" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/account/orders", label: "My Orders", Icon: Package },
          { href: "/account/addresses", label: "Addresses", Icon: MapPin },
          { href: "/account/loyalty", label: "Loyalty Points", Icon: Star },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-xl border p-4 text-sm font-medium hover:border-primary-700 transition-colors"
          >
            <Icon className="h-4 w-4 text-link" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <form onSubmit={(e) => { void saveProfile(e); }} className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-lg">Profile</h2>
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" value={fullName} maxLength={255} onChange={(e) => { setFullName(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency_pref">Currency</Label>
          <select
            id="currency_pref"
            value={currency}
            onChange={(e) => { setCurrency(e.target.value as CurrencyCode); setSaved(false); }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            Prices are shown in this currency. Cash on delivery and bank transfers are always paid in rupees.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Where do you live?</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => { setCountry(e.target.value); setSaved(false); }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose a country…</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            So we remind you of Mother&apos;s Day on your country&apos;s date.
          </p>
        </div>
        <label htmlFor="occasion_reminders" className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            id="occasion_reminders"
            type="checkbox"
            checked={reminders}
            onChange={(e) => { setReminders(e.target.checked); setSaved(false); }}
            className="mt-0.5 h-4 w-4 accent-primary-700"
          />
          <span>
            <span className="block font-medium">Occasion reminders</span>
            <span className="block text-muted-foreground">
              A week before birthdays and anniversaries in your{" "}
              <Link href="/account/addresses" className="text-link hover:underline">family &amp; friends</Link>, and
              before Eid and Mother&apos;s Day, by email and WhatsApp.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          {saved && <span role="status" className="text-sm text-link">Saved</span>}
        </div>
      </form>

      <section className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-lg">Your data</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground max-w-sm">
            Download a copy of your profile and saved addresses as a JSON file.
          </p>
          <Button type="button" variant="outline" onClick={() => { void downloadData(); }} disabled={exporting} className="gap-2">
            <Download className="h-4 w-4" /> {exporting ? "Preparing…" : "Download my data"}
          </Button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Deleting your account removes your name, email, phone number and saved addresses, and signs you out
            everywhere. Past orders stay on record for delivery and accounting, linked to an anonymous account.
          </p>
          {!confirmOpen ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} className="gap-2">
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
              <Label htmlFor="confirm-delete">Type {CONFIRM_WORD} to confirm. This cannot be undone.</Label>
              <Input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={confirmText !== CONFIRM_WORD || deleting}
                  onClick={() => { void deleteAccount(); }}
                >
                  {deleting ? "Deleting…" : "Permanently delete account"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
