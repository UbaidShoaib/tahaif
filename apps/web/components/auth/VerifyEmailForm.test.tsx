import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VerifyEmailForm } from "./VerifyEmailForm";
import { useAuthStore } from "@/stores/auth.store";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("next=/checkout"),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
}));

const user = { id: "u1", email: "amna@example.com", is_verified: false } as never;

describe("VerifyEmailForm", () => {
  beforeEach(() => {
    replace.mockReset();
    apiFetch.mockReset();
    useAuthStore.setState({ user, accessToken: "tok", isLoading: false });
  });

  it("shows the address the code went to", () => {
    render(<VerifyEmailForm />);
    expect(screen.getByText("amna@example.com")).toBeInTheDocument();
  });

  it("keeps only digits and enables submit at six", () => {
    render(<VerifyEmailForm />);
    const input = screen.getByLabelText("Verification code");
    fireEvent.change(input, { target: { value: "12a34" } });
    expect(input).toHaveValue("1234");
    expect(screen.getByRole("button", { name: "Verify email" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "123456" } });
    expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
  });

  it("verifies and returns to the next page", async () => {
    apiFetch.mockResolvedValue({ ...(user as object), is_verified: true });
    render(<VerifyEmailForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout"));
    expect(apiFetch).toHaveBeenCalledWith("/auth/verify-email", expect.objectContaining({ body: { code: "123456" } }));
    expect(useAuthStore.getState().user?.is_verified).toBe(true);
  });

  it("starts with resend on cooldown", () => {
    render(<VerifyEmailForm />);
    expect(screen.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
  });
});
