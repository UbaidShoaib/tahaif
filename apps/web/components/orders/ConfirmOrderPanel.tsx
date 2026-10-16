"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { socialOrdersApi } from "@/lib/social-orders";

type Recipient = { name: string; phone: string; address: string };

/**
 * For orders our team took in an Instagram/WhatsApp chat (ADR 0009): the buyer
 * checks the recipient's details, fixes typos, and confirms. This confirmation,
 * not the chat history, is the record of what was agreed.
 */
export function ConfirmOrderPanel({ publicToken, recipient }: { publicToken: string; recipient: Recipient }) {
  const router = useRouter();
  const [name, setName] = useState(recipient.name);
  const [phone, setPhone] = useState(recipient.phone);
  const [address, setAddress] = useState(recipient.address);
  const [terms, setTerms] = useState(false);
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) {
      setError("Please accept the terms and refund policy to confirm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await socialOrdersApi.confirm(publicToken, {
        accept_terms: true,
        marketing_opt_in: offers,
        // Send only what changed, so an untouched field is never rewritten.
        ...(name.trim() !== recipient.name && { recipient_name: name.trim() }),
        ...(phone.trim() !== recipient.phone && { recipient_phone: phone.trim() }),
        ...(address.trim() !== recipient.address && { address_line1: address.trim() }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not confirm your order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="confirm-heading"
      className="mb-6 space-y-4 rounded-xl border border-link/40 bg-card p-5"
    >
      <div>
        <h2 id="confirm-heading" className="text-h3 flex items-center gap-2">
          <ClipboardCheck aria-hidden className="h-5 w-5 text-link" />
          Please check and confirm your order
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Our team entered this order from your chat. Check the details below and fix anything that&apos;s wrong.
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <FormField label="Recipient name" required>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </FormField>
        <FormField label="Recipient phone" required>
          {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </FormField>
        <FormField label="Delivery address" required>
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </FormField>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          <span>
            The details and total are correct, and I accept the{" "}
            <Link href="/terms" className="text-link underline">terms</Link> and{" "}
            <Link href="/refund" className="text-link underline">refund policy</Link>.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={offers}
            onChange={(e) => setOffers(e.target.checked)}
          />
          <span>Send me occasional offers on WhatsApp and email (optional; you can stop any time).</span>
        </label>

        {error && (
          <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Confirming…" : "Confirm order"}
        </Button>
      </form>
    </section>
  );
}
