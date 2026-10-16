import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteReports } from "@/components/admin/NoteReports";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const note = (overrides = {}) => ({
  item_id: "i1",
  order_id: "o1",
  public_token: "pt1",
  product_name: "Red Roses",
  greeting_message: "Happy birthday",
  content_type: "audio/webm",
  media_url: "https://signed.example/note",
  consent_at: "2026-10-15T10:00:00Z",
  consent_ip: "203.0.113.7",
  disabled_at: null,
  last_reported_at: "2026-10-16T10:00:00Z",
  reports: [
    { id: "r1", reason: "threatening", details: "I don't know this person", status: "open", created_at: "2026-10-16T10:00:00Z" },
  ],
  ...overrides,
});

describe("NoteReports", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows the queue with the report, consent record and recording", async () => {
    vi.mocked(apiFetch).mockResolvedValue([note()]);
    const { container } = render(<NoteReports token="tok" />);

    const card = await screen.findByRole("article", { name: "Reported note on Red Roses" });
    expect(card).toHaveTextContent("Threatening");
    expect(card).toHaveTextContent("I don't know this person");
    expect(card).toHaveTextContent("203.0.113.7");
    expect(container.querySelector("audio source")).toHaveAttribute("src", "https://signed.example/note");
    expect(screen.getByRole("link", { name: /Open order/ })).toHaveAttribute("href", "/track/pt1");
    expect(apiFetch).toHaveBeenCalledWith("/admin/note-reports?status=open", { token: "tok" });
  });

  it("takes a note down and reloads the queue", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([note()]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    render(<NoteReports token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Take note down" }));

    expect(apiFetch).toHaveBeenCalledWith("/admin/note-reports/i1/disable", { method: "POST", token: "tok" });
    expect(await screen.findByText("No reported notes are waiting.")).toBeInTheDocument();
  });

  it("offers restore for a note that was taken down", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      note({ disabled_at: "2026-10-16T12:00:00Z", reports: [{ ...note().reports[0], status: "note_disabled" }] }),
    ]);
    render(<NoteReports token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "All reports" }));

    expect(apiFetch).toHaveBeenLastCalledWith("/admin/note-reports?status=all", { token: "tok" });
    expect(await screen.findByRole("button", { name: "Restore note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take note down" })).not.toBeInTheDocument();
    expect(screen.getByText(/^Taken down /)).toBeInTheDocument();
  });

  it("shows an error from the API", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(403, "Not allowed"));
    render(<NoteReports token="tok" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
  });
});
