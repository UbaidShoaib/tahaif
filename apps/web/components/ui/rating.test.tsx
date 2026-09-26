import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Rating, RatingInput } from "@/components/ui/rating";

describe("Rating", () => {
  it("is announced as a single image with the score", () => {
    render(<Rating value={4.5} />);
    const stars = screen.getByRole("img", { name: "4.5 out of 5 stars" });
    const fills = Array.from(stars.querySelectorAll("[data-fill]")).map((el) => el.getAttribute("data-fill"));
    expect(fills).toEqual(["full", "full", "full", "full", "half"]);
  });
});

describe("RatingInput", () => {
  function Harness({ onChange = vi.fn() }: { onChange?: (n: number) => void }) {
    const [v, setV] = useState(5);
    return <RatingInput value={v} onChange={(n) => { setV(n); onChange(n); }} />;
  }

  it("is a labelled radio group with the current value checked", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 stars" })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("changes by click and keyboard", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByText("3 stars"));
    expect(onChange).toHaveBeenLastCalledWith(3);
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "2 stars" })).toBeChecked();
  });
});
