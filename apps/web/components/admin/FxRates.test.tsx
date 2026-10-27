import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FxRates } from "@/components/admin/FxRates";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const auto = { id: "a", quote_currency: "GBP", rate: "0.002800", source: "auto", fetched_at: "2026-10-26T00:00:00Z" };
const manual = { ...auto, id: "m", rate: "0.002500", source: "manual" };
const rates = [
  { quote_currency: "GBP", auto, manual, effective_rate: "0.002500" },
  { quote_currency: "AED", auto: null, manual: null, effective_rate: null },
];

describe("FxRates", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) => Promise.resolve(path === "/admin/fx-rates" ? rates : {}));
  });

  it("shows rates as rupees per unit and which one is charged", async () => {
    render(<FxRates token="t" />);
    expect(await screen.findByText("Rs 357.14")).toBeInTheDocument();
    expect(screen.getByText("Rs 400.00")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("Not chargeable yet")).toBeInTheDocument();
  });

  it("sets a manual rate from rupees per unit and clears one", async () => {
    render(<FxRates token="t" />);
    await userEvent.type(await screen.findByLabelText("Rupees per AED"), "76");
    await userEvent.click(screen.getAllByRole("button", { name: "Set" })[1]);
    expect(apiFetch).toHaveBeenCalledWith("/admin/fx-rates/override", {
      method: "POST", token: "t", body: { quote_currency: "AED", rate: "0.013158" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Use daily rate" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/fx-rates/override/GBP", { method: "DELETE", token: "t" });
  });

  it("refuses a rate that isn't a number", async () => {
    render(<FxRates token="t" />);
    await userEvent.type(await screen.findByLabelText("Rupees per GBP"), "lots");
    await userEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter how many rupees one GBP costs");
  });
});
