import { apiFetch } from "@/lib/api";

export interface ThanksPageData {
  recipient_name: string;
  gift_from: string | null;
  /** Product names in this delivery. */
  items: string[];
  already_sent: boolean;
}

export const MAX_THANKS_MESSAGE = 1000;
export const MAX_THANKS_BYTES = 25 * 1024 * 1024;

export const thanksApi = {
  get: (token: string) => apiFetch<ThanksPageData>(`/thanks/${token}`),
  send: (token: string, message: string, file: File | null) => {
    const form = new FormData();
    if (message.trim()) form.append("message", message.trim());
    if (file) form.append("file", file);
    return apiFetch<void>(`/thanks/${token}`, { method: "POST", body: form });
  },
};

/** Path the card's "say thank you" QR points to. */
export const thanksPath = (token: string) => `/thanks/${token}`;
