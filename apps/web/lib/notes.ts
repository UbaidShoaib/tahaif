import { apiFetch } from "@/lib/api";

export interface CardNoteRead {
  /** Short-lived signed link to the recording. */
  media_url: string;
  content_type: string;
  greeting_message: string | null;
  product_name: string;
}

/** Keep in step with the API (schemas/order.py NoteReportReason). */
export const NOTE_REPORT_REASONS = {
  abusive: "Abusive or harassing",
  threatening: "Threatening",
  sexual: "Sexual or indecent",
  hateful: "Hateful (religion, sect, community)",
  unwanted: "I don't want messages from this sender",
  other: "Something else",
} as const;

export type NoteReportReason = keyof typeof NOTE_REPORT_REASONS;

export interface CardNoteReport {
  reason: NoteReportReason;
  details?: string;
}

/** Keep in step with the API (s3_client.MAX_NOTE_BYTES). */
export const MAX_NOTE_BYTES = 25 * 1024 * 1024;

export const notesApi = {
  /** `acceptedTerms` must be true: the buyer confirmed the card-note content rules. */
  attach: (publicToken: string, itemId: string, file: File, acceptedTerms: boolean) => {
    const form = new FormData();
    form.append("file", file);
    form.append("accepted_terms", String(acceptedTerms));
    return apiFetch<void>(`/orders/by-token/${publicToken}/items/${itemId}/note`, { method: "POST", body: form });
  },
  remove: (publicToken: string, itemId: string) =>
    apiFetch<void>(`/orders/by-token/${publicToken}/items/${itemId}/note`, { method: "DELETE" }),
  get: (noteToken: string) => apiFetch<CardNoteRead>(`/notes/${noteToken}`),
  report: (noteToken: string, body: CardNoteReport) =>
    apiFetch<void>(`/notes/${noteToken}/report`, { method: "POST", body }),
};

/** Path the card's QR code points to. */
export const notePath = (noteToken: string) => `/note/${noteToken}`;
