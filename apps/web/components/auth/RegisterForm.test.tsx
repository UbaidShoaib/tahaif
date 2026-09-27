import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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
  email: "new@example.com",
  full_name: "New User",
  role: "customer" as const,
  locale: "en",
  currency_pref: "PKR",
  avatar_url: null,
  is_verified: false,
  created_at: "2026-01-01T00:00:00Z",
};

describe("RegisterForm", () => {
  const setSession = vi.fn();

  beforeEach(() => {
    push.mockReset();
    setSession.mockReset();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(useAuthStore).mockReturnValue({ setSession });
  });

  it("validates name length, email and password strength", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Full name"), "A");
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "weak");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("requires an uppercase letter and a number in the password", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Full name"), "Ahmed Khan");
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "lowercase");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Must contain an uppercase letter")).toBeInTheDocument();
  });

  it("registers successfully and redirects home", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ access_token: "tok-1", user: mockUser });

    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Full name"), "New User");
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Str0ngPass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await vi.waitFor(() => expect(setSession).toHaveBeenCalledWith(mockUser, "tok-1"));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows the server error on a failed registration (e.g. duplicate email)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "Email already registered"));

    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Full name"), "New User");
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Str0ngPass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
  });

  it("shows a password strength meter once the user starts typing a password", async () => {
    const { container } = render(<RegisterForm />);
    expect(container.querySelectorAll(".h-1.flex-1").length).toBe(0);
    await userEvent.type(screen.getByLabelText("Password"), "Str0ng!");
    expect(container.querySelectorAll(".h-1.flex-1").length).toBe(4);
  });
});
