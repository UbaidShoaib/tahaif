import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, toast, useToastStore } from "@/components/ui/toast";

// jsdom lacks the Pointer Capture API that Radix Toast's swipe handling calls.
beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
  });
});

describe("toast", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("shows a toast with its title and description", () => {
    render(<Toaster />);
    act(() => {
      toast({ variant: "success", title: "Added to your cart", description: "Red Roses" });
    });
    expect(screen.getByText("Added to your cart")).toBeInTheDocument();
    expect(screen.getByText("Red Roses")).toBeInTheDocument();
  });

  it("runs the action and can be dismissed", async () => {
    const onUndo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast({ title: "Removed Cake", action: { label: "Undo", onClick: onUndo } });
    });
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("keeps at most three toasts", () => {
    for (let i = 0; i < 5; i++) toast({ title: `T${i}` });
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(["T2", "T3", "T4"]);
  });
});
