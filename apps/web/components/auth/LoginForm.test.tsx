import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Cookies from "js-cookie";
import { LoginForm } from "@/components/auth/LoginForm";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("js-cookie", () => ({
  default: { set: vi.fn() },
}));

const mockUser = {
  id: "u1",
  email: "buyer@example.com",
  full_name: "Buyer",
  role: "customer" as const,
  locale: "en",
  currency_pref: "PKR",
  avatar_url: null,
  is_verified: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("LoginForm", () => {
  const setSession = vi.fn();

  beforeEach(() => {
    push.mockReset();
    setSession.mockReset();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(useAuthStore).mockReturnValue({ setSession });
  });

  it("shows validation errors for an empty submit", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("never calls the API for a malformed email (blocked by native or zod validation)", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    // The <input type="email"> triggers native browser constraint validation
    // before React's submit handler even runs, so this asserts the net effect
    // (no request sent) rather than which validation layer caught it.
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("logs in, stores the session, sets a cookie, and redirects on success", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ access_token: "tok-1", user: mockUser });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(setSession).toHaveBeenCalledWith(mockUser, "tok-1"));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Cookies.set is a vi.fn() mock, not a `this`-bound method
    expect(Cookies.set).toHaveBeenCalledWith("tahaif_session", "customer", expect.objectContaining({ sameSite: "lax" }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows the server error message on a failed login", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(401, "Invalid credentials"));

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("shows a generic error for non-ApiError failures", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("network down"));

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Login failed. Please try again.")).toBeInTheDocument();
  });
});
