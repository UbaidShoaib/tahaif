import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderStatusBadge, statusLabel } from "@/components/orders/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";

describe("OrderStatusBadge", () => {
  it("shows a readable label and an icon, not color alone", () => {
    const { container } = render(<OrderStatusBadge status="out_for_delivery" />);
    expect(screen.getByText("Out for delivery")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses semantic variants", () => {
    render(
      <>
        <OrderStatusBadge status="delivered" />
        <OrderStatusBadge status="cancelled" />
        <OrderStatusBadge status="failed" kind="fulfillment" />
      </>,
    );
    expect(screen.getByText("Delivered")).toHaveClass("bg-success-soft");
    expect(screen.getByText("Cancelled")).toHaveClass("bg-destructive-soft");
    expect(screen.getByText("Delivery failed")).toHaveClass("bg-destructive-soft");
  });

  it("falls back to a humanized label for unknown statuses", () => {
    render(<OrderStatusBadge status="awaiting_vendor" />);
    expect(screen.getByText("Awaiting vendor")).toHaveClass("bg-muted");
    expect(statusLabel("ready", "fulfillment")).toBe("Ready for dispatch");
  });
});

describe("Badge", () => {
  it("defaults to the neutral variant", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toHaveClass("bg-muted");
  });
});
