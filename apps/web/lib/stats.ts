import { apiFetch } from "@/lib/api";

export interface OnTimeStats {
  /** Whole-number %, or null until there are enough deliveries to be meaningful. */
  on_time_percent: number | null;
  delivered_count: number;
  window_days: number;
  min_sample: number;
}

export const statsApi = {
  onTime: (vendorId?: string) =>
    apiFetch<OnTimeStats>(`/stats/on-time${vendorId ? `?vendor_id=${vendorId}` : ""}`),
};

/**
 * The on-time % to show, or null. A trust signal is optional: a failed request
 * or a small sample hides it rather than breaking the page.
 */
export async function onTimePercent(vendorId?: string): Promise<number | null> {
  try {
    return (await statsApi.onTime(vendorId)).on_time_percent;
  } catch {
    return null;
  }
}
