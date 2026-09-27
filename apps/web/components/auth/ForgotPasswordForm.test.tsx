import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("requires a valid email before submitting", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows a confirmation screen after a successful request", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/auth/forgot-password", {
      method: "POST",
      body: { email: "buyer@example.com" },
    });
  });

  it("shows an error message when the request fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "Server error"));
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "buyer@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
  });
});
