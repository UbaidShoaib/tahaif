import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmOrderPanel } from "@/components/orders/ConfirmOrderPanel";
import { ApiError } from "@/lib/api";
import { socialOrdersApi } from "@/lib/social-orders";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/social-orders", () => ({ socialOrdersApi: { confirm: vi.fn() } }));

const recipient = { name: "Ammi Jaan", phone: "+923001234567", address: "12 Main Boulevard, Gulberg" };

describe("ConfirmOrderPanel", () => {
  beforeEach(() => {
    vi.mocked(socialOrdersApi.confirm).mockReset();
    refresh.mockReset();
  });

  it("requires accepting the terms", async () => {
    render(<ConfirmOrderPanel publicToken="tok" recipient={recipient} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/accept the terms/);
    expect(socialOrdersApi.confirm).not.toHaveBeenCalled();
  });

  it("sends only changed fields and the opt-in, then refreshes", async () => {
    vi.mocked(socialOrdersApi.confirm).mockResolvedValue({} as never);
    render(<ConfirmOrderPanel publicToken="tok" recipient={recipient} />);

    const address = screen.getByLabelText(/Delivery address/);
    await userEvent.clear(address);
    await userEvent.type(address, "14 Main Boulevard, Gulberg III");
    await userEvent.click(screen.getByLabelText(/I accept the/));
    await userEvent.click(screen.getByLabelText(/Send me occasional offers/));
    await userEvent.click(screen.getByRole("button", { name: "Confirm order" }));

    expect(socialOrdersApi.confirm).toHaveBeenCalledWith("tok", {
      accept_terms: true,
      marketing_opt_in: true,
      address_line1: "14 Main Boulevard, Gulberg III",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the API's reason when confirming fails", async () => {
    vi.mocked(socialOrdersApi.confirm).mockRejectedValue(new ApiError(409, "This order can no longer be changed"));
    render(<ConfirmOrderPanel publicToken="tok" recipient={recipient} />);
    await userEvent.click(screen.getByLabelText(/I accept the/));
    await userEvent.click(screen.getByRole("button", { name: "Confirm order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This order can no longer be changed");
    expect(refresh).not.toHaveBeenCalled();
  });
});
