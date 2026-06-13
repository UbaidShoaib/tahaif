import { create } from "zustand";
import { apiFetch } from "@/lib/api";

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
}

interface AuthState {
  user: UserRead | null;
  accessToken: string | null;
  isLoading: boolean;
  setSession: (user: UserRead, accessToken: string) => void;
  clearSession: () => void;
  refresh: () => Promise<boolean>;
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
      return true;
    } catch {
      set({ user: null, accessToken: null, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    const { accessToken } = get();
    try {
      await apiFetch("/auth/logout", { method: "POST", token: accessToken ?? undefined });
    } catch {
      // ignore errors — clear session regardless
    }
    set({ user: null, accessToken: null });
  },
}));
