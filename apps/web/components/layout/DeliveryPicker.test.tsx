import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliveryPicker } from "@/components/layout/DeliveryPicker";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { useDeliveryStore } from "@/stores/delivery.store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const LHR = { id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true };

describe("DeliveryPicker", () => {
  beforeEach(() => {
    useDeliveryStore.setState({ cities: [], cityId: null, loadCities: vi.fn().mockResolvedValue(undefined) });
  });

  it("renders nothing until cities are known", () => {
    const { container } = render(<DeliveryPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a labelled select that updates the shared city", async () => {
    useDeliveryStore.setState({ cities: [LHR] });
    render(<DeliveryPicker />);
    const select = screen.getByRole("combobox", { name: "Deliver to" });
    await userEvent.selectOptions(select, "lhr");
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
  });
});

describe("HeaderSearch", () => {
  it("sends the query to the search page", async () => {
    const onSubmitted = vi.fn();
    render(<HeaderSearch onSubmitted={onSubmitted} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search gifts" }), "red roses{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=red%20roses");
    expect(onSubmitted).toHaveBeenCalled();
  });
});
