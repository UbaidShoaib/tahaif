import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotePage from "@/app/note/[token]/page";
import { notesApi } from "@/lib/notes";
import type * as NotesModule from "@/lib/notes";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof NotesModule>();
  return { ...actual, notesApi: { ...actual.notesApi, get: vi.fn() } };
});

const page = (token: string) => NotePage({ params: Promise.resolve({ token }) });

describe("NotePage", () => {
  it("plays a video note with the card message", async () => {
    vi.mocked(notesApi.get).mockResolvedValue({
      media_url: "https://s3/notes/x.mp4?X-Amz-Signature=abc",
      content_type: "video/mp4",
      greeting_message: "Eid Mubarak Ammi!",
      product_name: "Fudge Cake",
    });
    const { container } = render(await page("n-1"));

    expect(screen.getByRole("heading", { name: "A message for you" })).toBeInTheDocument();
    expect(container.querySelector("video source")).toHaveAttribute("src", "https://s3/notes/x.mp4?X-Amz-Signature=abc");
    expect(screen.getByText("Eid Mubarak Ammi!")).toBeInTheDocument();
    expect(notesApi.get).toHaveBeenCalledWith("n-1");
  });

  it("plays a voice note as audio", async () => {
    vi.mocked(notesApi.get).mockResolvedValue({
      media_url: "https://s3/notes/x.m4a",
      content_type: "audio/mp4",
      greeting_message: null,
      product_name: "Roses",
    });
    const { container } = render(await page("n-2"));

    expect(container.querySelector("audio source")).toHaveAttribute("type", "audio/mp4");
    expect(container.querySelector("video")).toBeNull();
  });

  it("is not found for an unknown or removed note", async () => {
    vi.mocked(notesApi.get).mockRejectedValue(new Error("404"));
    await expect(page("gone")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
