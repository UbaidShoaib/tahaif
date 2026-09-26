import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

describe("FormField", () => {
  it("links the label, hint and control", () => {
    render(
      <FormField label="Recipient phone" hint="Include the country code">
        {(p) => <Input type="tel" {...p} />}
      </FormField>,
    );
    const input = screen.getByLabelText("Recipient phone");
    expect(input).toHaveAccessibleDescription("Include the country code");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks required fields for sighted and screen-reader users", () => {
    render(<FormField label="Name" required>{(p) => <Input {...p} />}</FormField>);
    const input = screen.getByRole("textbox", { name: /Name/ });
    expect(input).toBeRequired();
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
  });

  it("announces errors and marks the control invalid", () => {
    render(
      <FormField label="Address" hint="House, street, area" error="Enter the delivery address">
        {(p) => <Input {...p} />}
      </FormField>,
    );
    const input = screen.getByLabelText("Address");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("House, street, area Enter the delivery address");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the delivery address");
  });

  it("uses a provided id", () => {
    render(<FormField label="Coupon" id="coupon">{(p) => <Input {...p} />}</FormField>);
    expect(screen.getByLabelText("Coupon")).toHaveAttribute("id", "coupon");
  });
});
