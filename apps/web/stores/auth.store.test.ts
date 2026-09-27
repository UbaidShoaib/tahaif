import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api";
import { useAuthStore, type UserRead } from "@/stores/auth.store";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockUser: UserRead = {
  id: "u1",
  email: "test@example.com",
  full_name: "Test User",
  role: "customer",
  locale: "en",
  currency_pref: "PKR",
  avatar_url: null,
  is_verified: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    vi.mocked(apiFetch).mockReset();
  });

  it("setSession stores the user and token and clears loading", () => {
    useAuthStore.getState().setSession(mockUser, "token-1");
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe("token-1");
    expect(state.isLoading).toBe(false);
  });

  it("clearSession wipes the session", () => {
    useAuthStore.getState().setSession(mockUser, "token-1");
    useAuthStore.getState().clearSession();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("refresh sets the session on success and returns true", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ access_token: "new-token", user: mockUser });

    const ok = await useAuthStore.getState().refresh();

    expect(ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe("new-token");
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it("refresh clears the session and returns false on failure", async () => {
    useAuthStore.setState({ user: mockUser, accessToken: "stale-token" });
    vi.mocked(apiFetch).mockRejectedValue(new Error("401"));

    const ok = await useAuthStore.getState().refresh();

    expect(ok).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("logout clears the session even if the API call fails", async () => {
    useAuthStore.setState({ user: mockUser, accessToken: "token-1" });
    vi.mocked(apiFetch).mockRejectedValue(new Error("network error"));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("logout sends the current access token", async () => {
    useAuthStore.setState({ user: mockUser, accessToken: "token-1" });
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(apiFetch).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      token: "token-1",
    });
  });
});
