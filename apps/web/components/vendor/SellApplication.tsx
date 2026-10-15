"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { brand } from "@/lib/brand";
import { ApplicationDocuments, DOCUMENT_LABELS } from "@/components/vendor/ApplicationDocuments";
import { useAuthStore } from "@/stores/auth.store";

export type DocumentKind = "cnic_front" | "cnic_back" | "business_registration" | "shop_photo";

export type VendorDocument = {
  id: string;
  kind: DocumentKind;
  filename: string;
  content_type: string;
  created_at: string;
  url: string | null;
};

export type VendorApplication = {
  id: string;
  name: string;
  slug: string;
  city_id: string;
  city_name: string;
  contact_phone: string | null;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  bank_account_title: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  documents: VendorDocument[];
  missing_documents: DocumentKind[];
};

type City = { id: string; name: string };

// Mirrors VendorApplicationCreate (apps/api/app/schemas/vendor.py).
const schema = z.object({
  name: z.string().trim().min(2, "Enter your shop's name").max(255, "Name must be 255 characters or fewer"),
  city_id: z.string().min(1, "Choose the city your shop is in"),
  contact_phone: z
    .string()
    .trim()
    .min(7, "Enter a phone number we can call, e.g. +92 300 1234567")
    .max(30, "Phone number must be 30 characters or fewer")
    .regex(/^\+?[\d\s()-]+$/, "Use digits only, with an optional + for the country code"),
  description: z.string().trim().max(2000, "Description must be 2000 characters or fewer").optional(),
  bank_account_title: z.string().trim().min(2, "Enter the name on the bank account").max(255),
  bank_name: z.string().trim().min(2, "Enter your bank's name").max(100),
  bank_iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^PK\d{2}[A-Z]{4}\d{16}$/, "Enter a 24-character Pakistani IBAN, e.g. PK36SCBL0000001123456702")),
});
type FormData = z.infer<typeof schema>;

export function SellApplication() {
  const { user, accessToken: token, isLoading: authLoading, refresh } = useAuthStore();
  const [application, setApplication] = useState<VendorApplication | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setCities(await apiFetch<City[]>("/cities"));
      try {
        const mine = await apiFetch<VendorApplication>("/vendor/application", { token });
        setApplication(mine);
        if (mine.status === "rejected") {
          reset({
            name: mine.name,
            city_id: mine.city_id,
            contact_phone: mine.contact_phone ?? "",
            description: mine.description ?? "",
            bank_account_title: mine.bank_account_title ?? "",
            bank_name: mine.bank_name ?? "",
            bank_iban: mine.bank_iban ?? "",
          });
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
        setApplication(null); // not applied yet
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load your application. Try again.");
    } finally {
      setLoading(false);
    }
  }, [token, reset]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    void load();
  }, [authLoading, user, load]);

  // Approval changes the account's role; pick it up without a fresh login so
  // the vendor portal (gated on the role) opens straight away.
  const needsRoleRefresh = application?.status === "approved" && user?.role === "customer";
  useEffect(() => {
    if (needsRoleRefresh) void refresh();
  }, [needsRoleRefresh, refresh]);

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      const saved = await apiFetch<VendorApplication>("/vendor/application", {
        method: "POST",
        token: token ?? undefined,
        body: { ...data, description: data.description || null },
      });
      setApplication(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not send your application. Try again.");
    }
  };

  if (authLoading || (user && loading)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Sign in or create an account first, then tell us about your shop.</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login?callbackUrl=%2Fsell">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (application?.status === "approved") {
    return (
      <Alert>
        <CheckCircle2 aria-hidden className="h-4 w-4" />
        <AlertTitle>{application.name} is open</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Your shop is approved. Manage your orders and products from the vendor portal.</p>
          <Button asChild size="sm">
            <Link href="/vendor/dashboard">Open the vendor portal</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (application?.status === "pending") {
    const missing = application.missing_documents;
    return (
      <div className="space-y-6">
        {missing.length > 0 ? (
          <Alert variant="warning">
            <AlertTitle>One more step: upload your documents</AlertTitle>
            <AlertDescription>
              We can review {application.name} once you upload: {missing.map((k) => DOCUMENT_LABELS[k]).join(", ")}.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <Clock aria-hidden className="h-4 w-4" />
            <AlertTitle>We&apos;re reviewing {application.name}</AlertTitle>
            <AlertDescription>
              Your application for a shop in {application.city_name} is with our team. We&apos;ll contact you on{" "}
              {application.contact_phone}. Come back to this page to see the decision.
            </AlertDescription>
          </Alert>
        )}
        {token && <ApplicationDocuments application={application} token={token} onChange={setApplication} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {application?.status === "rejected" && (
        <Alert variant="destructive">
          <XCircle aria-hidden className="h-4 w-4" />
          <AlertTitle>Your application was not approved</AlertTitle>
          <AlertDescription>
            {application.review_note ?? "Our team could not approve it this time."} You can change the details
            below and send it again.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="space-y-4" noValidate>
        <FormField label="Shop name" required error={errors.name?.message}>
          {(p) => <Input placeholder="Gulberg Florist" {...p} {...register("name")} />}
        </FormField>

        <FormField label="City" required error={errors.city_id?.message}>
          {(p) => (
            <Select defaultValue="" {...p} {...register("city_id")}>
              <option value="" disabled>Choose a city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          label="Contact phone"
          required
          hint="We call this number to confirm your details."
          error={errors.contact_phone?.message}
        >
          {(p) => <Input type="tel" placeholder="+92 300 1234567" autoComplete="tel" {...p} {...register("contact_phone")} />}
        </FormField>

        <FormField
          label="What do you sell?"
          hint="A sentence or two. Shown on your shop page once you're approved."
          error={errors.description?.message}
        >
          {(p) => <Textarea {...p} {...register("description")} />}
        </FormField>

        <fieldset className="space-y-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Where we pay you</legend>
          <FormField label="Account title" required hint="The name on the bank account." error={errors.bank_account_title?.message}>
            {(p) => <Input autoComplete="off" {...p} {...register("bank_account_title")} />}
          </FormField>
          <FormField label="Bank" required error={errors.bank_name?.message}>
            {(p) => <Input placeholder="Meezan Bank" autoComplete="off" {...p} {...register("bank_name")} />}
          </FormField>
          <FormField label="IBAN" required hint="24 characters, starting with PK." error={errors.bank_iban?.message}>
            {(p) => <Input placeholder="PK36 SCBL 0000 0011 2345 6702" autoComplete="off" spellCheck={false} {...p} {...register("bank_iban")} />}
          </FormField>
        </fieldset>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : application ? "Send again" : "Send application"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your shop stays hidden until {brand.name} approves it. Next you&apos;ll upload your CNIC.
        </p>
      </form>

      {application?.status === "rejected" && token && (
        <ApplicationDocuments application={application} token={token} onChange={setApplication} />
      )}
    </div>
  );
}
