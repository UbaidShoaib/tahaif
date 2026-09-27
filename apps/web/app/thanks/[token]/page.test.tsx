import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ThanksPage from "@/app/thanks/[token]/page";
import { thanksApi } from "@/lib/thanks";
import type * as ThanksModule from "@/lib/thanks";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/thanks", async (importOriginal) => {
  const actual = await importOriginal<typeof ThanksModule>();
  return { ...actual, thanksApi: { ...actual.thanksApi, get: vi.fn() } };
});

const page = (token: string) => ThanksPage({ params: Promise.resolve({ token }) });

describe("ThanksPage", () => {
  it("greets the recipient and names the sender", async () => {
    vi.mocked(thanksApi.get).mockResolvedValue({
      recipient_name: "Ammi",
      gift_from: "Ali (London)",
      items: ["Fudge Cake", "Red Roses"],
      already_sent: false,
    });
    render(await page("th-1"));

    expect(screen.getByRole("heading", { name: "Say thank you to Ali (London)" })).toBeInTheDocument();
    expect(screen.getByText("Assalam-o-Alaikum Ammi! You received Fudge Cake and Red Roses.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to Ali (London)" })).toBeInTheDocument();
  });

  it("is not found for an unknown link", async () => {
    vi.mocked(thanksApi.get).mockRejectedValue(new Error("404"));
    await expect(page("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
