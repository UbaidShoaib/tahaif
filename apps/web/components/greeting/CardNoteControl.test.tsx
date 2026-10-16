import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardNoteControl } from "@/components/greeting/CardNoteControl";
import { ApiError } from "@/lib/api";
import { notesApi } from "@/lib/notes";
import type { OrderItemRead } from "@/lib/cart";
import type * as NotesModule from "@/lib/notes";

vi.mock("@/lib/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof NotesModule>();
  return { ...actual, notesApi: { ...actual.notesApi, attach: vi.fn(), remove: vi.fn() } };
});

const item = (overrides: Partial<OrderItemRead> = {}): OrderItemRead => ({
  id: "i-1",
  product_name: "Fudge Cake",
  variant_name: null,
  qty: 1,
  unit_price_pkr: 400000,
  line_total_pkr: 400000,
  greeting_message: "Love you Ammi",
  has_note: false,
  can_edit_note: true,
  ...overrides,
});

const accept = () => userEvent.click(screen.getByRole("checkbox", { name: /follows the content rules/ }));

const voice = () => new File(["x"], "note.m4a", { type: "audio/mp4" });

describe("CardNoteControl", () => {
  beforeEach(() => {
    vi.mocked(notesApi.attach).mockReset();
    vi.mocked(notesApi.remove).mockReset();
  });

  it("uploads a recording for the card", async () => {
    vi.mocked(notesApi.attach).mockResolvedValue(undefined);
    render(<CardNoteControl publicToken="tok" item={item()} />);
    await accept();

    const file = voice();
    await userEvent.upload(screen.getByLabelText("Voice or video note for Fudge Cake"), file);

    expect(notesApi.attach).toHaveBeenCalledWith("tok", "i-1", file, true);
    expect(await screen.findByText("Your note will play from a QR code on the card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace note" })).toBeInTheDocument();
  });

  it("rejects files that aren't recordings", async () => {
    render(<CardNoteControl publicToken="tok" item={item()} />);

    await userEvent.upload(
      screen.getByLabelText("Voice or video note for Fudge Cake"),
      new File(["x"], "a.pdf", { type: "application/pdf" }),
      { applyAccept: false },
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Choose an audio or video recording.");
    expect(notesApi.attach).not.toHaveBeenCalled();
  });

  it("removes an attached note", async () => {
    vi.mocked(notesApi.remove).mockResolvedValue(undefined);
    render(<CardNoteControl publicToken="tok" item={item({ has_note: true })} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove note" }));

    expect(notesApi.remove).toHaveBeenCalledWith("tok", "i-1");
    expect(await screen.findByRole("button", { name: "Add a voice or video note" })).toBeInTheDocument();
  });

  it("explains an upload the API refused", async () => {
    vi.mocked(notesApi.attach).mockRejectedValue(
      new ApiError(409, "The gift has already left the shop, so its card can't be changed"),
    );
    render(<CardNoteControl publicToken="tok" item={item()} />);

    await userEvent.upload(screen.getByLabelText("Voice or video note for Fudge Cake"), voice());

    expect(await screen.findByRole("alert")).toHaveTextContent("already left the shop");
  });

  it("is read-only once the gift has left the shop", () => {
    render(<CardNoteControl publicToken="tok" item={item({ has_note: true, can_edit_note: false })} />);

    expect(screen.getByText("A voice/video note is on the card")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("records a voice note in the browser and uploads it", async () => {
    class FakeRecorder {
      static isTypeSupported = (t: string) => t === "audio/webm";
      mimeType = "audio/webm;codecs=opus";
      state = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"]) });
        this.onstop?.();
      }
    }
    const track = { stop: vi.fn() };
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    });
    vi.mocked(notesApi.attach).mockResolvedValue(undefined);
    render(<CardNoteControl publicToken="tok" item={item()} />);
    await accept();

    await userEvent.click(await screen.findByRole("button", { name: "Record a voice note" }));
    await userEvent.click(await screen.findByRole("button", { name: /Stop & save/ }));

    const file = vi.mocked(notesApi.attach).mock.calls[0][2];
    expect(file.type).toBe("audio/webm");
    expect(file.name).toBe("voice-note.webm");
    expect(track.stop).toHaveBeenCalled();
    expect(await screen.findByText("Your note will play from a QR code on the card")).toBeInTheDocument();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("asks the buyer to accept the content rules before adding a note", async () => {
    render(<CardNoteControl publicToken="tok" item={item()} />);

    const add = screen.getByRole("button", { name: "Add a voice or video note" });
    expect(add).toBeDisabled();
    expect(screen.getByRole("link", { name: "content rules" })).toHaveAttribute("href", "/terms#card-notes");

    await accept();
    expect(add).toBeEnabled();
  });
});
