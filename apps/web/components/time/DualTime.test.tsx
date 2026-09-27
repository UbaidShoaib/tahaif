import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DualTime } from "@/components/time/DualTime";
import { viewerTimeZone } from "@/lib/datetime";
import type * as DateTimeModule from "@/lib/datetime";

vi.mock("@/lib/datetime", async (importOriginal) => ({
  ...(await importOriginal<typeof DateTimeModule>()),
  viewerTimeZone: vi.fn(),
}));

const ISO = "2026-09-28T09:30:00Z"; // 2:30 pm in Pakistan

describe("DualTime", () => {
  it("shows Pakistan time plus the buyer's time when they're abroad", async () => {
    vi.mocked(viewerTimeZone).mockReturnValue("Europe/London");
    render(<DualTime iso={ISO} cityTz="Asia/Karachi" />);

    expect(await screen.findByText("(10:30 am your time)")).toBeInTheDocument();
    expect(screen.getByText(/28 Sep, 2:30 pm PKT/)).toBeInTheDocument();
    expect(screen.getByText(/28 Sep/).closest("time")).toHaveAttribute("dateTime", ISO);
  });

  it("shows only the city time for a buyer in Pakistan", () => {
    vi.mocked(viewerTimeZone).mockReturnValue("Asia/Karachi");
    render(<DualTime iso={ISO} />);

    expect(screen.getByText("28 Sep, 2:30 pm PKT")).toBeInTheDocument();
    expect(screen.queryByText(/your time/)).not.toBeInTheDocument();
  });
});
