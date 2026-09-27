import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Price } from "@/components/money/Price";
import { CurrencySelect } from "@/components/layout/CurrencySelect";
import { useCurrencyStore } from "@/stores/currency.store";

const ns = (s: string | null) => (s ?? "").replace(/ /g, " ");

describe("Price", () => {
  beforeEach(() => {
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1", GBP: "0.002800" } });
  });

  it("shows rupees by default", () => {
    render(<Price pkr={535_000} />);
    expect(ns(screen.getByText(/Rs/).textContent)).toBe("Rs 5,350");
  });

  it("shows an approximate converted price with the rupee amount in the tooltip", () => {
    useCurrencyStore.setState({ currency: "GBP" });
    render(<Price pkr={535_000} />);
    const el = screen.getByText(/£/);
    expect(ns(el.textContent)).toBe("≈ £14.98");
    expect(ns(el.getAttribute("title"))).toContain("Rs 5,350");
  });

  it("re-renders when the buyer switches currency", () => {
    render(<Price pkr={535_000} />);
    act(() => useCurrencyStore.setState({ currency: "GBP" }));
    expect(screen.getByText(/£14.98/)).toBeInTheDocument();
  });
});

describe("CurrencySelect", () => {
  it("is hidden until at least one foreign rate exists", () => {
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1" } });
    const { container } = render(<CurrencySelect />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists PKR first and then the available currencies", () => {
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1", USD: "0.0036", GBP: "0.0028" } });
    render(<CurrencySelect />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["PKR", "GBP", "USD"]);
  });
});
