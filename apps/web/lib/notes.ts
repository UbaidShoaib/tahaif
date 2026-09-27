import { apiFetch } from "@/lib/api";

export interface CardNoteRead {
  /** Short-lived signed link to the recording. */
  media_url: string;
  content_type: string;
  greeting_message: string | null;
  product_name: string;
}

/** Keep in step with the API (s3_client.MAX_NOTE_BYTES). */
export const MAX_NOTE_BYTES = 25 * 1024 * 1024;

export const notesApi = {
  attach: (publicToken: string, itemId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<void>(`/orders/by-token/${publicToken}/items/${itemId}/note`, { method: "POST", body: form });
  },
  remove: (publicToken: string, itemId: string) =>
    apiFetch<void>(`/orders/by-token/${publicToken}/items/${itemId}/note`, { method: "DELETE" }),
  get: (noteToken: string) => apiFetch<CardNoteRead>(`/notes/${noteToken}`),
};

/** Path the card's QR code points to. */
export const notePath = (noteToken: string) => `/note/${noteToken}`;
