import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThanksReceived } from "@/components/thanks/ThanksReceived";

describe("ThanksReceived", () => {
  it("shows the recipient's words and photo to the buyer", () => {
    render(
      <ThanksReceived
        from="Ammi"
        thanks={{ message: "Shukriya beta!", media_url: "https://s3/t.jpg", media_type: "image/jpeg", sent_at: "" }}
      />,
    );
    expect(screen.getByRole("region", { name: "Thank-you from Ammi" })).toHaveTextContent("Ammi sent you a thank-you");
    expect(screen.getByText("“Shukriya beta!”")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo from Ammi" })).toHaveAttribute("src", "https://s3/t.jpg");
  });

  it("plays a voice thank-you", () => {
    const { container } = render(
      <ThanksReceived
        from="Ammi"
        thanks={{ message: null, media_url: "https://s3/t.m4a", media_type: "audio/mp4", sent_at: "" }}
      />,
    );
    expect(container.querySelector("audio source")).toHaveAttribute("src", "https://s3/t.m4a");
  });
});
