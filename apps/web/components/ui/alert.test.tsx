import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, AlertDescription } from "@/components/ui/alert";

describe("Alert", () => {
  it("renders as an alert role with its description", () => {
    render(
      <Alert>
        <AlertDescription>Something went wrong</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("applies destructive variant styling", () => {
    render(<Alert variant="destructive">Error</Alert>);
    expect(screen.getByRole("alert")).toHaveClass("text-destructive");
  });
});
