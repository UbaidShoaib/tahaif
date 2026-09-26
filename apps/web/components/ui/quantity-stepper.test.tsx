import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuantityStepper } from "@/components/ui/quantity-stepper";

describe("QuantityStepper", () => {
  it("names the item in every button label", async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={2} onChange={onChange} itemName="Red Roses" />);
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Red Roses" }));
    await userEvent.click(screen.getByRole("button", { name: "Decrease quantity of Red Roses" }));
    expect(onChange.mock.calls).toEqual([[3], [1]]);
  });

  it("offers Remove instead of going to zero", async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} itemName="Cake" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Cake" }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("respects max and pending", () => {
    const { rerender } = render(<QuantityStepper value={3} max={3} onChange={vi.fn()} itemName="Cake" />);
    expect(screen.getByRole("button", { name: "Increase quantity of Cake" })).toBeDisabled();
    rerender(<QuantityStepper value={2} pending onChange={vi.fn()} itemName="Cake" />);
    expect(screen.getByRole("button", { name: "Decrease quantity of Cake" })).toBeDisabled();
  });
});
