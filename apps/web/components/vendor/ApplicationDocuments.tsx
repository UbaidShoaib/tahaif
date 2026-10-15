"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import type { DocumentKind, VendorApplication } from "@/components/vendor/SellApplication";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  cnic_front: "CNIC (front)",
  cnic_back: "CNIC (back)",
  business_registration: "Business registration (NTN, SECP or trade licence)",
  shop_photo: "Photo of your shop or kitchen",
};
const REQUIRED: DocumentKind[] = ["cnic_front", "cnic_back"];

type Props = {
  application: VendorApplication;
  token: string;
  onChange: (updated: VendorApplication) => void;
};

/** Verification uploads for an open application. Each file goes up as soon as it is picked. */
export function ApplicationDocuments({ application, token, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(kind: DocumentKind, file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Each file must be 10 MB or smaller.");
      return;
    }
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file);
    setBusy(kind);
    try {
      onChange(await apiFetch<VendorApplication>("/vendor/application/documents", { method: "POST", token, body }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(id);
    try {
      onChange(await apiFetch<VendorApplication>(`/vendor/application/documents/${id}`, { method: "DELETE", token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not remove the file. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="docs-heading" className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 id="docs-heading" className="font-semibold">Verification documents</h2>
        <p className="text-sm text-muted-foreground">
          Photos or PDFs, up to 10 MB each. Only our team can see them.
        </p>
      </div>
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <ul className="space-y-2">
        {(Object.keys(DOCUMENT_LABELS) as DocumentKind[]).map((kind) => {
          const doc = application.documents.find((d) => d.kind === kind);
          const inputId = `doc-${kind}`;
          return (
            <li key={kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {DOCUMENT_LABELS[kind]}
                  {REQUIRED.includes(kind) ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground"> (optional)</span>}
                </p>
                {doc && (
                  <p className="flex items-center gap-1 truncate text-muted-foreground">
                    <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-success" /> {doc.filename}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  aria-label={`${doc ? "Replace" : "Upload"} ${DOCUMENT_LABELS[kind]}`}
                  disabled={busy !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(kind, file);
                  }}
                />
                <Button asChild size="sm" variant="outline" className="gap-1" aria-disabled={busy !== null}>
                  <label htmlFor={inputId} className="cursor-pointer">
                    <FileUp aria-hidden className="h-3.5 w-3.5" />
                    {busy === kind ? "Uploading…" : doc ? "Replace" : "Upload"}
                  </label>
                </Button>
                {doc && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${DOCUMENT_LABELS[kind]}`}
                    disabled={busy !== null}
                    onClick={() => void remove(doc.id)}
                  >
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
