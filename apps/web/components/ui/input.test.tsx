import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("renders with the given type and placeholder", () => {
    render(<Input type="email" placeholder="you@example.com" />);
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input).toHaveAttribute("type", "email");
  });

  it("accepts typed input", async () => {
    render(<Input aria-label="email" />);
    const input = screen.getByLabelText("email");
    await userEvent.type(input, "hello@tahaif.com");
    expect(input).toHaveValue("hello@tahaif.com");
  });

  it("calls onChange handlers", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="field" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("field"), "x");
    expect(onChange).toHaveBeenCalled();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Input aria-label="disabled-field" disabled />);
    expect(screen.getByLabelText("disabled-field")).toBeDisabled();
  });
});
