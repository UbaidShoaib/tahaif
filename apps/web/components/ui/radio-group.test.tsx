import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RadioCard, RadioChip, RadioGroup } from "@/components/ui/radio-group";

function Payment({ onChange = vi.fn() }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("cod");
  return (
    <RadioGroup
      legend="Payment method"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    >
      <RadioCard value="cod">Cash on Delivery</RadioCard>
      <RadioCard value="bank_transfer">Bank Transfer</RadioCard>
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("exposes a labelled group of native radios", () => {
    render(<Payment />);
    expect(screen.getByRole("group", { name: "Payment method" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Cash on Delivery" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Bank Transfer" })).not.toBeChecked();
  });

  it("selects by click and by arrow keys", async () => {
    const onChange = vi.fn();
    render(<Payment onChange={onChange} />);
    await userEvent.click(screen.getByText("Bank Transfer"));
    expect(screen.getByRole("radio", { name: "Bank Transfer" })).toBeChecked();

    screen.getByRole("radio", { name: "Bank Transfer" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Cash on Delivery" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("cod");
  });

  it("disables sold-out chips and explains why", () => {
    render(
      <RadioGroup legend="Size" value="1lb" onValueChange={vi.fn()}>
        <RadioChip value="1lb">1lb</RadioChip>
        <RadioChip value="2lb" disabled disabledReason="sold out">
          2lb
        </RadioChip>
      </RadioGroup>,
    );
    const soldOut = screen.getByRole("radio", { name: /2lb\s*\(sold out\)/ });
    expect(soldOut).toBeDisabled();
  });

  it("throws when an item is rendered outside a group", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<RadioChip value="x">x</RadioChip>)).toThrow(/inside <RadioGroup>/);
  });
});
