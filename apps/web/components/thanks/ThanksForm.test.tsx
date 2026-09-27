import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThanksForm } from "@/components/thanks/ThanksForm";
import { ApiError } from "@/lib/api";
import { thanksApi } from "@/lib/thanks";
import type * as ThanksModule from "@/lib/thanks";

vi.mock("@/lib/thanks", async (importOriginal) => {
  const actual = await importOriginal<typeof ThanksModule>();
  return { ...actual, thanksApi: { ...actual.thanksApi, send: vi.fn() } };
});

describe("ThanksForm", () => {
  beforeEach(() => {
    vi.mocked(thanksApi.send).mockReset();
  });

  it("sends words and a photo, then confirms", async () => {
    vi.mocked(thanksApi.send).mockResolvedValue(undefined);
    render(<ThanksForm token="th-1" sender="Ali" alreadySent={false} />);

    await userEvent.type(screen.getByLabelText(/Your message/), "Shukriya beta!");
    const photo = new File(["x"], "smile.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText(/Add a photo, voice note or video/), photo);
    await userEvent.click(screen.getByRole("button", { name: "Send to Ali" }));

    expect(thanksApi.send).toHaveBeenCalledWith("th-1", "Shukriya beta!", photo);
    expect(await screen.findByRole("status")).toHaveTextContent("Your thank-you is on its way to Ali");
  });

  it("asks for words or a file before sending", async () => {
    render(<ThanksForm token="th-1" sender="Ali" alreadySent={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Send to Ali" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Write a few words");
    expect(thanksApi.send).not.toHaveBeenCalled();
  });

  it("explains a failed send and keeps the form", async () => {
    vi.mocked(thanksApi.send).mockRejectedValue(new ApiError(503, "Storage is unavailable right now."));
    render(<ThanksForm token="th-1" sender="Ali" alreadySent />);

    expect(screen.getByText(/Sending again replaces it/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Your message/), "Thank you");
    await userEvent.click(screen.getByRole("button", { name: "Send to Ali" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Storage is unavailable");
    expect(screen.getByRole("button", { name: "Send to Ali" })).toBeEnabled();
  });
});
