import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GreetingEditor } from "@/components/cart/GreetingEditor";
import { useCartStore } from "@/stores/cart.store";
import type { CartItemRead } from "@/lib/cart";

const item: CartItemRead = {
  id: "ci-1", product_id: "p1", product_name: "Cake", product_slug: "cake", product_image: null,
  variant_id: null, variant_name: null, qty: 2, unit_price_pkr: 100, line_total_pkr: 200,
  delivery_date: null, greeting_message: null, recipient_name: null, recipient_phone: null,
};

describe("GreetingEditor", () => {
  const updateItem = vi.fn();

  beforeEach(() => {
    updateItem.mockReset();
    useCartStore.setState({ updateItem });
  });

  it("offers to add a message when there is none", () => {
    render(<GreetingEditor item={item} />);
    expect(screen.getByText("No greeting card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a message" })).toBeInTheDocument();
  });

  it("shows the saved message", () => {
    render(<GreetingEditor item={{ ...item, greeting_message: "Happy birthday!" }} />);
    expect(screen.getByText("“Happy birthday!”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit message" })).toBeInTheDocument();
  });

  it("saves a trimmed message and keeps the line quantity", async () => {
    updateItem.mockResolvedValue(undefined);
    render(<GreetingEditor item={item} />);

    await userEvent.click(screen.getByRole("button", { name: "Add a message" }));
    await userEvent.type(screen.getByLabelText("Greeting card message"), "  Love, Ali  ");
    await userEvent.click(screen.getByRole("button", { name: "Save message" }));

    expect(updateItem).toHaveBeenCalledWith("ci-1", { qty: 2, greeting_message: "Love, Ali" });
    expect(screen.queryByLabelText("Greeting card message")).not.toBeInTheDocument();
  });

  it("keeps the editor open and explains a failed save", async () => {
    updateItem.mockRejectedValue(new Error("boom"));
    render(<GreetingEditor item={item} />);

    await userEvent.click(screen.getByRole("button", { name: "Add a message" }));
    await userEvent.type(screen.getByLabelText("Greeting card message"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Save message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your message");
    expect(screen.getByLabelText("Greeting card message")).toBeInTheDocument();
  });

  it("caps the message at the API limit", async () => {
    render(<GreetingEditor item={item} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a message" }));
    expect(screen.getByLabelText("Greeting card message")).toHaveAttribute("maxLength", "500");
  });
});
