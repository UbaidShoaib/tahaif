import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GreetingComposer } from "@/components/greeting/GreetingComposer";

function Harness() {
  const [value, setValue] = useState("");
  return <GreetingComposer id="g" value={value} onChange={setValue} />;
}

const preview = () => screen.getByRole("figure", { name: "Card preview" });

describe("GreetingComposer", () => {
  it("previews the card as the buyer types", async () => {
    render(<Harness />);
    expect(preview()).toHaveTextContent("Your message will appear here");

    await userEvent.type(screen.getByLabelText(/Greeting card message/), "Love you Ammi");

    expect(preview()).toHaveTextContent("Love you Ammi");
  });

  it("fills an Urdu template, laid out right-to-left", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Need words? Use a message idea" }));
    await userEvent.click(screen.getByRole("button", { name: "اردو" }));
    await userEvent.click(screen.getByRole("button", { name: "Eid" }));

    const field = screen.getByLabelText(/Greeting card message/);
    expect((field as HTMLTextAreaElement).value).toMatch(/^عید مبارک/);
    expect(field).toHaveAttribute("dir", "auto");
    expect(preview().querySelector("blockquote")).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("button", { name: "اردو" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers Roman Urdu for families who read Urdu in Latin script", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Need words? Use a message idea" }));
    await userEvent.click(screen.getByRole("button", { name: "Roman Urdu" }));
    await userEvent.click(screen.getByRole("button", { name: "Birthday" }));

    expect(preview()).toHaveTextContent(/^Salgirah mubarak!/);
  });
});
