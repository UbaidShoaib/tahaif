import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";

describe("Breadcrumb", () => {
  it("renders an ordered trail with the current page marked", () => {
    render(<Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Cakes", href: "/c/cakes" }, { label: "Fudge Cake" }]} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Cakes" })).toHaveAttribute("href", "/c/cakes");
    expect(screen.getByText("Fudge Cake")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Fudge Cake" })).not.toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders a heading, description and action", () => {
    render(<EmptyState title="Your cart is empty" description="Add a gift" action={<a href="/search">Browse</a>} />);
    expect(screen.getByRole("heading", { level: 2, name: "Your cart is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse" })).toBeInTheDocument();
  });
});

describe("Alert variants", () => {
  it("uses polite status for success/info and alert for errors", () => {
    render(
      <>
        <Alert variant="success">Saved</Alert>
        <Alert variant="destructive">Failed</Alert>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
  });
});
