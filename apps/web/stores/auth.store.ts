import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { clearSessionMarker, hasSessionMarker, setSessionMarker } from "@/lib/session";

export interface UserRead {
  id: string;
  email: string;
  full_name: string | null;
  role: "customer" | "vendor" | "staff" | "admin";
  locale: string;
  currency_pref: string;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;
  /** ISO country code of where the buyer lives (Mother's Day dates differ). */
  country?: string | null;
  /** Birthday, anniversary, Eid and Mother's Day reminders. */
  occasion_reminders?: boolean;
}

interface AuthState {
  user: UserRead | null;
  accessToken: string | null;
  isLoading: boolean;
  setSession: (user: UserRead, accessToken: string) => void;
  clearSession: () => void;
  refresh: () => Promise<boolean>;
  /** Startup check: only asks the API when a session marker exists, so guests make no failing call. */
  restoreSession: () => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setSession: (user, accessToken) => set({ user, accessToken, isLoading: false }),

  clearSession: () => set({ user: null, accessToken: null, isLoading: false }),

  refresh: async () => {
    try {
      const data = await apiFetch<{ access_token: string; user: UserRead }>(
        "/auth/refresh",
        { method: "POST" },
      );
      set({ user: data.user, accessToken: data.access_token, isLoading: false });
      setSessionMarker(data.user.role); // keep role and expiry in step with the refresh token
      return true;
    } catch {
      set({ user: null, accessToken: null, isLoading: false });
      clearSessionMarker();
      return false;
    }
  },

  restoreSession: async () => {
    if (!hasSessionMarker()) {
      set({ user: null, accessToken: null, isLoading: false });
      return false;
    }
    return get().refresh();
  },

  logout: async () => {
    const { accessToken } = get();
    try {
      await apiFetch("/auth/logout", { method: "POST", token: accessToken ?? undefined });
    } catch {
      // ignore errors — clear session regardless
    }
    clearSessionMarker();
    set({ user: null, accessToken: null });
  },
}));
