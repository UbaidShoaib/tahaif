import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignReport } from "@/components/admin/CampaignReport";
import { reportsApi, type CampaignSalesReport } from "@/lib/social-orders";
import type * as SocialModule from "@/lib/social-orders";

vi.mock("@/lib/social-orders", async () => {
  const actual = await vi.importActual<typeof SocialModule>("@/lib/social-orders");
  return { ...actual, reportsApi: { campaigns: vi.fn() } };
});

const report: CampaignSalesReport = {
  days: 30,
  rows: [
    { source: "instagram", campaign: "eid-reel", orders: 3, paid_orders: 2, revenue_pkr: 700000, avg_order_pkr: 350000 },
    { source: "web", campaign: null, orders: 1, paid_orders: 0, revenue_pkr: 0, avg_order_pkr: 0 },
  ],
  total_orders: 4,
  total_paid_orders: 2,
  total_revenue_pkr: 700000,
};

describe("CampaignReport", () => {
  beforeEach(() => vi.mocked(reportsApi.campaigns).mockReset());

  it("shows a row per channel and campaign with totals", async () => {
    vi.mocked(reportsApi.campaigns).mockResolvedValue(report);
    render(<CampaignReport token="tok" />);

    const row = (await screen.findByText("eid-reel")).closest("tr")!;
    expect(within(row).getByText("Instagram")).toBeInTheDocument();
    expect(within(row).getByText(/7,000/)).toBeInTheDocument();
    expect(within(row).getByText(/3,500/)).toBeInTheDocument();
    expect(screen.getByText("(none)").closest("tr")).toHaveTextContent("—");
    expect(reportsApi.campaigns).toHaveBeenCalledWith(30, "tok");
  });

  it("reloads for another date range", async () => {
    vi.mocked(reportsApi.campaigns).mockResolvedValue(report);
    render(<CampaignReport token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(reportsApi.campaigns).toHaveBeenLastCalledWith(7, "tok");
  });

  it("says so when there are no orders", async () => {
    vi.mocked(reportsApi.campaigns).mockResolvedValue({ ...report, rows: [], total_orders: 0 });
    render(<CampaignReport token="tok" />);
    expect(await screen.findByText(/No orders in the last 30 days/)).toBeInTheDocument();
  });
});
