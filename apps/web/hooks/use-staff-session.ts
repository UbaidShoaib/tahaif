"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isBackOfficeRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Admin pages: the access token once a staff, admin or super admin session is ready, null until then.
 * Waits for the session to restore from the refresh cookie before redirecting, so a hard
 * reload doesn't bounce staff to /login.
 */
export function useStaffSession(callbackPath: string): string | null {
  const router = useRouter();
  const { accessToken, user, isLoading } = useAuthStore();
  const allowed = isBackOfficeRole(user?.role);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.push(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
    else if (!allowed) router.push("/");
  }, [isLoading, user, allowed, router, callbackPath]);

  return !isLoading && allowed ? accessToken : null;
}
