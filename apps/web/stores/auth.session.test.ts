import { describe, it, expect, vi, beforeEach } from "vitest";
import Cookies from "js-cookie";
import { apiFetch } from "@/lib/api";
import { useAuthStore, type UserRead } from "@/stores/auth.store";
import { SESSION_COOKIE, clearSessionMarker, hasSessionMarker, setSessionMarker } from "@/lib/session";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const vendor: UserRead = {
  id: "u1", email: "v@example.com", full_name: null, role: "vendor", locale: "en",
  currency_pref: "PKR", avatar_url: null, is_verified: true, created_at: "",
};

describe("session marker", () => {
  beforeEach(() => {
    Cookies.remove(SESSION_COOKIE);
    vi.mocked(apiFetch).mockReset();
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
  });

  it("round-trips through the cookie helpers", () => {
    expect(hasSessionMarker()).toBe(false);
    setSessionMarker("customer");
    expect(Cookies.get(SESSION_COOKIE)).toBe("customer");
    clearSessionMarker();
    expect(hasSessionMarker()).toBe(false);
  });

  it("guests skip the refresh call on startup, so no 401 is logged", async () => {
    const ok = await useAuthStore.getState().restoreSession();
    expect(ok).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("restores a session when the marker exists and re-syncs the role", async () => {
    setSessionMarker("customer"); // stale role from an earlier login
    vi.mocked(apiFetch).mockResolvedValue({ access_token: "tok", user: vendor });

    expect(await useAuthStore.getState().restoreSession()).toBe(true);
    expect(apiFetch).toHaveBeenCalledWith("/auth/refresh", { method: "POST" });
    expect(Cookies.get(SESSION_COOKIE)).toBe("vendor");
  });

  it("clears the marker when the refresh token is no longer valid", async () => {
    setSessionMarker("customer");
    vi.mocked(apiFetch).mockRejectedValue(new Error("401"));

    expect(await useAuthStore.getState().restoreSession()).toBe(false);
    expect(hasSessionMarker()).toBe(false);
  });

  it("logout removes the marker even when the API call fails", async () => {
    setSessionMarker("customer");
    useAuthStore.setState({ user: vendor, accessToken: "tok", isLoading: false });
    vi.mocked(apiFetch).mockRejectedValue(new Error("network"));

    await useAuthStore.getState().logout();

    expect(hasSessionMarker()).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});
