"use client";

import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/use-polling";

/** Re-renders the server-rendered tracking page so status changes appear without a manual refresh. */
export function LiveOrderRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  usePolling(() => router.refresh(), active);
  return null;
}
