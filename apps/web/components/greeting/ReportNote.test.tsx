import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportNote } from "@/components/greeting/ReportNote";
import { ApiError } from "@/lib/api";
import { notesApi } from "@/lib/notes";
import type * as NotesModule from "@/lib/notes";

vi.mock("@/lib/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof NotesModule>();
  return { ...actual, notesApi: { ...actual.notesApi, report: vi.fn() } };
});

describe("ReportNote", () => {
  beforeEach(() => {
    vi.mocked(notesApi.report).mockReset();
  });

  it("sends a report with a reason and details", async () => {
    vi.mocked(notesApi.report).mockResolvedValue(undefined);
    render(<ReportNote noteToken="n-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Report this message" }));
    await userEvent.selectOptions(screen.getByLabelText("What's wrong with it?"), "threatening");
    await userEvent.type(screen.getByLabelText(/Anything else/), "  I don't know them ");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(notesApi.report).toHaveBeenCalledWith("n-1", { reason: "threatening", details: "I don't know them" });
    expect(await screen.findByRole("status")).toHaveTextContent("received your report");
  });

  it("shows the API's error and lets them retry", async () => {
    vi.mocked(notesApi.report).mockRejectedValue(new ApiError(429, "Too many requests"));
    render(<ReportNote noteToken="n-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Report this message" }));
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
  });
});
