import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function Demo() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open cart</Button>
      </SheetTrigger>
      <SheetContent title="Your cart" closeLabel="Close cart">
        <a href="/checkout">Checkout</a>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("opens as a titled modal dialog and closes on Escape, restoring focus", async () => {
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Open cart" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Your cart" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes with the labelled close button", async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole("button", { name: "Open cart" }));
    await userEvent.click(screen.getByRole("button", { name: "Close cart" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
