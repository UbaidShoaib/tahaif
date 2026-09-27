import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(apiFetch).mockReset();
    searchParams = new URLSearchParams("token=reset-tok-1");
  });

  it("validates the new password's strength", async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "weak");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("submits the token from the URL along with the new password", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "Str0ngPass");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await vi.waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/reset-password", {
        method: "POST",
        body: { token: "reset-tok-1", new_password: "Str0ngPass" },
      }),
    );
    expect(push).toHaveBeenCalledWith("/login?reset=1");
  });

  it("shows an error immediately when there is no token in the URL", async () => {
    searchParams = new URLSearchParams();
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "Str0ngPass");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Invalid reset link. Please request a new one.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows the server error when the reset link has expired", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(400, "Link expired"));
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "Str0ngPass");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Link expired")).toBeInTheDocument();
  });
});
