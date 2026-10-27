import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShopManager } from "@/components/admin/ShopManager";
import { apiFetch } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const house = {
  id: "v1", name: "Bouquet Bar", slug: "bouquet-bar", description: null, logo_url: null, contact_phone: null,
  city_id: "lhr", city_name: "Lahore", is_active: true, is_house: true, owner_email: null, product_count: 12,
  live_product_count: 10, bank_account_title: null, bank_name: null, bank_iban: null,
};
const partner = {
  ...house, id: "v2", name: "Gulberg Florist", slug: "gulberg", is_house: false, owner_email: "owner@example.com",
  is_active: false, bank_account_title: "Gulberg Florist", bank_name: "Meezan", bank_iban: "PK36MEZN0000000000000000",
};

describe("ShopManager", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === "/admin/vendors") return Promise.resolve([house, partner]);
      if (path === "/cities") return Promise.resolve([{ id: "lhr", name: "Lahore" }, { id: "khi", name: "Karachi" }]);
      return Promise.resolve({});
    });
  });

  it("lists shops with owner, products and payout details", async () => {
    render(<ShopManager token="t" />);
    expect(await screen.findByText(/Lahore · 10 of 12 products live · house shop/)).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Paid to: Gulberg Florist, Meezan, PK36/)).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("asks before closing a shop, and reopens one", async () => {
    render(<ShopManager token="t" />);
    await userEvent.click(await screen.findByRole("button", { name: "Close Bouquet Bar" }));
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/vendors/v1", expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "Confirm closing Bouquet Bar" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/vendors/v1", { method: "PATCH", token: "t", body: { is_active: false } });

    await userEvent.click(screen.getByRole("button", { name: "Reopen Gulberg Florist" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/vendors/v2", { method: "PATCH", token: "t", body: { is_active: true } });
  });

  it("edits a shop's phone and city", async () => {
    render(<ShopManager token="t" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit Bouquet Bar" }));
    await userEvent.type(screen.getByLabelText(/Contact phone/), "+923001234567");
    await userEvent.selectOptions(screen.getAllByLabelText(/^City/)[1], "khi");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiFetch).toHaveBeenCalledWith("/admin/vendors/v1", {
      method: "PATCH", token: "t",
      body: { name: "Bouquet Bar", contact_phone: "+923001234567", city_id: "khi", description: null, logo_url: null },
    });
  });

  it("opens a house shop in the first city by default", async () => {
    render(<ShopManager token="t" />);
    await screen.findByRole("button", { name: "Edit Bouquet Bar" });
    await userEvent.type(screen.getByLabelText(/Shop name/), "Cake Corner");
    await userEvent.click(screen.getByRole("button", { name: /Open shop/ }));
    expect(apiFetch).toHaveBeenCalledWith("/vendors", {
      method: "POST", token: "t", body: { name: "Cake Corner", slug: "cake-corner", city_id: "lhr", description: null },
    });
  });
});
