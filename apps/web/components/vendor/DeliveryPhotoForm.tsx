"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { vendorApi, type VendorFulfillmentRead } from "@/lib/vendor";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  fulfillment: VendorFulfillmentRead;
  token: string;
  onDone: (updated: VendorFulfillmentRead) => void;
};

/**
 * Proof of delivery for the rider: a doorstep photo plus who received the gift.
 * Submitting marks the fulfillment delivered, so the buyer (often overseas) gets
 * one "delivered" message that already points to the photo.
 */
export function DeliveryPhotoForm({ fulfillment, token, onDone }: Props) {
  const delivered = fulfillment.status === "delivered";
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [receivedBy, setReceivedBy] = useState(fulfillment.received_by ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Camera aria-hidden className="h-4 w-4" />
        {delivered
          ? fulfillment.delivery_photo_url
            ? "Replace delivery photo"
            : "Add delivery photo"
          : "Deliver with photo"}
      </Button>
    );
  }

  const choose = (file: File | undefined) => {
    setError(null);
    if (!file) return setPhoto(null);
    if (!ACCEPTED.includes(file.type)) return setError("Choose a JPEG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) return setError("The photo must be 10 MB or smaller.");
    setPhoto(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return setError("Take or choose a photo of the delivered gift.");
    setSubmitting(true);
    setError(null);
    try {
      onDone(await vendorApi.confirmDeliveryWithPhoto(fulfillment.id, photo, receivedBy, token));
      setOpen(false);
      setPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the photo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="mt-3 space-y-3 rounded-lg border bg-muted/40 p-4">
      <FormField label="Delivery photo" required hint="Show the gift at the door. JPEG, PNG or WebP, up to 10 MB.">
        {(p) => (
          <Input
            {...p}
            type="file"
            accept={ACCEPTED.join(",")}
            capture="environment"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        )}
      </FormField>
      <FormField label="Received by" hint="Optional, e.g. the recipient or a family member.">
        {(p) => (
          <Input
            {...p}
            value={receivedBy}
            maxLength={255}
            autoComplete="off"
            onChange={(e) => setReceivedBy(e.target.value)}
          />
        )}
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Uploading…" : delivered ? "Save photo" : "Confirm delivery"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
