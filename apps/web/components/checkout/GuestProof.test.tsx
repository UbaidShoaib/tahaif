import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProofUpload } from "@/components/checkout/ProofUpload";
import { GuestOrderNote } from "@/components/checkout/GuestOrderNote";
import { useAuthStore } from "@/stores/auth.store";

afterEach(() => vi.unstubAllGlobals());

describe("guest receipts and order note (ADR 0004)", () => {
  it("uploads with the order's public token when not signed in", async () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchFn);
    const { container } = render(<ProofUpload orderId="o1" publicToken="pub-1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "receipt.jpg", { type: "image/jpeg" }));
    expect(fetchFn.mock.calls[0]?.[0]).toMatch(/\/orders\/by-token\/pub-1\/proof$/);
    expect((fetchFn.mock.calls[0]?.[1] as RequestInit).headers).toBeUndefined();
    expect(await screen.findByText(/Receipt uploaded/)).toBeInTheDocument();
  });

  it("shows guests how to find their order again, but not signed-in buyers", () => {
    useAuthStore.setState({ user: null, isLoading: false });
    const { rerender } = render(<GuestOrderNote />);
    expect(screen.getByText("Keep this link to track your gift")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    useAuthStore.setState({ user: { id: "u1" } as never });
    rerender(<GuestOrderNote />);
    expect(screen.queryByText("Keep this link to track your gift")).not.toBeInTheDocument();
  });
});
