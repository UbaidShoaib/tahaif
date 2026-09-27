import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProofUpload } from "@/components/checkout/ProofUpload";
import { useAuthStore } from "@/stores/auth.store";

type RequestInitLike = RequestInit & { headers: Record<string, string> };

function makeFile(name = "receipt.png", type = "image/png") {
  return new File(["binary-content"], name, { type });
}

function mockResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe("ProofUpload", () => {
  const originalFetch = global.fetch;
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = vi.fn<typeof fetch>();
    global.fetch = fetchSpy;
    useAuthStore.setState({ accessToken: "mem-tok-1" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows the upload button initially", () => {
    render(<ProofUpload orderId="order-1" />);
    expect(screen.getByRole("button", { name: /Upload Receipt/ })).toBeInTheDocument();
  });

  it("uploads the selected file and shows a success state", async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    render(<ProofUpload orderId="order-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile());

    await waitFor(() =>
      expect(screen.getByText(/Receipt uploaded/)).toBeInTheDocument(),
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInitLike];
    expect(url).toContain("/orders/order-1/proof");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("shows an error message when the upload fails", async () => {
    fetchSpy.mockResolvedValue(mockResponse({ detail: "File too large" }, false));

    render(<ProofUpload orderId="order-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile());

    expect(await screen.findByText("File too large")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload Receipt/ })).toBeInTheDocument();
  });

  it("sends the in-memory access token from the auth store", async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    render(<ProofUpload orderId="order-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInitLike];
    expect(init.headers.Authorization).toBe("Bearer mem-tok-1");
  });

  it("asks the user to sign in instead of uploading without a token", async () => {
    useAuthStore.setState({ accessToken: null });

    render(<ProofUpload orderId="order-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile());

    expect(await screen.findByText(/Sign in again to upload/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
