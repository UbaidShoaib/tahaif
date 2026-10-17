import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStaffSession } from "@/hooks/use-staff-session";
import { useAuthStore } from "@/stores/auth.store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const user = (role: string) => ({ id: "u1", email: "a@example.com", full_name: null, role }) as never;

describe("useStaffSession", () => {
  beforeEach(() => push.mockReset());

  it("waits while the session restores", () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    const { result } = renderHook(() => useStaffSession("/admin/products/p1"));
    expect(result.current).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("sends guests to login and back", () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    renderHook(() => useStaffSession("/admin/products/p1"));
    expect(push).toHaveBeenCalledWith("/login?callbackUrl=%2Fadmin%2Fproducts%2Fp1");
  });

  it("turns customers away", () => {
    useAuthStore.setState({ user: user("customer"), accessToken: "tok", isLoading: false });
    const { result } = renderHook(() => useStaffSession("/admin"));
    expect(result.current).toBeNull();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("returns the token for staff", () => {
    useAuthStore.setState({ user: user("staff"), accessToken: "tok", isLoading: false });
    const { result } = renderHook(() => useStaffSession("/admin"));
    expect(result.current).toBe("tok");
    expect(push).not.toHaveBeenCalled();
  });
});
