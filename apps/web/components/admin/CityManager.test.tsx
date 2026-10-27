import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CityManager } from "@/components/admin/CityManager";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const lahore = {
  id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true,
  vendor_count: 2, product_count: 10, delivery_count: 40,
};
const quetta = { ...lahore, id: "qta", name: "Quetta", slug: "quetta", is_active: false, vendor_count: 0, product_count: 0, delivery_count: 0 };

describe("CityManager", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      Promise.resolve(path === "/admin/cities" ? [lahore, quetta] : {}));
  });

  it("lists cities with usage and only offers delete for unused ones", async () => {
    render(<CityManager token="t" />);
    expect(await screen.findByText("Lahore")).toBeInTheDocument();
    expect(screen.getByText(/2 shops · 10 products · 40 deliveries/)).toBeInTheDocument();
    expect(screen.getByText("Switched off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Lahore" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete Quetta" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete Quetta" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/cities/qta", { method: "DELETE", token: "t" });
    expect(await screen.findByText("Quetta deleted.")).toBeInTheDocument();
  });

  it("adds a city with a URL name made from its name", async () => {
    render(<CityManager token="t" />);
    await screen.findByText("Lahore");
    await userEvent.type(screen.getByLabelText(/City name/), "Dera Ghazi Khan");
    await userEvent.click(screen.getByRole("button", { name: /Add city/ }));
    expect(apiFetch).toHaveBeenCalledWith("/cities", {
      method: "POST", token: "t", body: { name: "Dera Ghazi Khan", slug: "dera-ghazi-khan", timezone: "Asia/Karachi" },
    });
  });

  it("switches a city off and edits it", async () => {
    render(<CityManager token="t" />);
    await screen.findByText("Lahore");
    await userEvent.click(screen.getByRole("button", { name: "Switch off Lahore" }));
    expect(apiFetch).toHaveBeenCalledWith("/cities/lahore", { method: "PATCH", token: "t", body: { is_active: false } });

    await userEvent.click(screen.getByRole("button", { name: "Edit Lahore" }));
    const nameBox = screen.getAllByLabelText(/City name/)[1];
    await userEvent.clear(nameBox);
    await userEvent.type(nameBox, "Lahore Cantt");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiFetch).toHaveBeenCalledWith("/cities/lahore", {
      method: "PATCH", token: "t", body: { name: "Lahore Cantt", timezone: "Asia/Karachi" },
    });
  });

  it("shows the API's reason when a save fails", async () => {
    render(<CityManager token="t" />);
    await screen.findByText("Lahore");
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(422, "Unknown time zone 'Mars'"));
    await userEvent.type(screen.getByLabelText(/City name/), "Mars");
    await userEvent.click(screen.getByRole("button", { name: /Add city/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown time zone 'Mars'");
  });
});
