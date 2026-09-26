import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { ShareTracking } from "@/components/orders/ShareTracking";
import { CopyButton } from "@/components/ui/copy-button";
import { orderNumber } from "@/lib/orders";

const steps = () => within(screen.getByRole("list", { name: "Order progress" })).getAllByRole("listitem");

describe("OrderTimeline", () => {
  it("marks earlier steps done and the current one with aria-current, in text not just colour", () => {
    render(<OrderTimeline status="preparing" />);
    const items = steps();
    expect(items[0]).toHaveTextContent("Order placedCompleted");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveTextContent("Being preparedCurrent status");
    expect(items[3]).toHaveTextContent("DispatchedUpcoming");
  });

  it("shows a completed order as fully delivered (it used to show no progress)", () => {
    render(<OrderTimeline status="completed" />);
    expect(screen.getByText("Order completed")).toBeInTheDocument();
    expect(steps().filter((li) => li.textContent?.includes("Completed")).length).toBeGreaterThanOrEqual(6);
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
  });

  it("explains cancelled and on-hold orders instead of an empty progress bar", () => {
    const { rerender } = render(<OrderTimeline status="cancelled" />);
    expect(screen.queryByRole("list", { name: "Order progress" })).not.toBeInTheDocument();
    expect(screen.getByText(/This order was cancelled/)).toBeInTheDocument();
    rerender(<OrderTimeline status="on_hold" />);
    expect(screen.getByRole("status")).toHaveTextContent(/on hold/);
  });
});

describe("sharing and copying", () => {
  it("formats a short order number", () => {
    expect(orderNumber("3f2a9c1b-44aa-4f00-9e2d-0123456789ab")).toBe("3F2A9C1B");
  });

  it("copies a value and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyButton value="PK36SCBL0000001123456702" label="IBAN" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy IBAN" }));
    expect(writeText).toHaveBeenCalledWith("PK36SCBL0000001123456702");
    expect(await screen.findByRole("button", { name: "IBAN copied" })).toBeInTheDocument();
  });

  it("shares the public tracking link on WhatsApp", () => {
    render(<ShareTracking publicToken="tok-1" />);
    const link = screen.getByRole("link", { name: /Share on WhatsApp/ });
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(`${window.location.origin}/track/tok-1`);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
