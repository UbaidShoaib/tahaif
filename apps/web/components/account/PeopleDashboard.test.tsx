import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PeopleDashboard } from "@/components/account/PeopleDashboard";
import { accountApi, type AddressRead } from "@/lib/account";
import { cartApi, type OrderRead } from "@/lib/cart";
import { loyaltyApi } from "@/lib/loyalty";
import type * as AccountModule from "@/lib/account";
import type * as CartModule from "@/lib/cart";
import type * as LoyaltyModule from "@/lib/loyalty";

vi.mock("@/lib/account", async (orig) => {
  const actual = await orig<typeof AccountModule>();
  return { ...actual, accountApi: { ...actual.accountApi, listAddresses: vi.fn() } };
});
vi.mock("@/lib/cart", async (orig) => {
  const actual = await orig<typeof CartModule>();
  return { ...actual, cartApi: { ...actual.cartApi, myOrders: vi.fn() } };
});
vi.mock("@/lib/loyalty", async (orig) => {
  const actual = await orig<typeof LoyaltyModule>();
  return { ...actual, loyaltyApi: { ...actual.loyaltyApi, getWallet: vi.fn() } };
});

const person = (id: string, name: string, extra: Partial<AddressRead> = {}): AddressRead => ({
  id, recipient_name: name, recipient_phone: "+92300", line1: "x", line2: null, city_name: "Lahore", landmark: null,
  alt_phone: null, is_default: false, ...extra,
});
const order = { id: "o1", public_token: "ceb4a993-0000", status: "preparing", total_pkr: 650_000,
  items: [{ product_name: "Truffle Cake" }], fulfillments: [{ recipient_name: "Shabana" }] } as unknown as OrderRead;

describe("PeopleDashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T09:00:00Z"));
    vi.mocked(cartApi.myOrders).mockResolvedValue([order]);
    vi.mocked(loyaltyApi.getWallet).mockResolvedValue({ balance_points: 420, lifetime_earned: 420, lifetime_burned: 0, updated_at: "" });
  });
  afterEach(() => vi.useRealTimers());

  it("lists people soonest occasion first with a send action, then recent orders", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([
      person("a2", "Bilal", { relationship: "Abbu", birthday: { month: 12, day: 6 } }),
      person("a1", "Shabana", { relationship: "Ammi", birthday: { month: 10, day: 29 } }),
      person("a3", "Hina"),
    ]);
    render(<PeopleDashboard token="tok" firstName="Sara" />);
    expect(screen.getByRole("heading", { name: "Hi Sara" })).toBeInTheDocument();
    const people = await screen.findAllByRole("listitem");
    expect(people[0]).toHaveTextContent("Ammi · Lahore");
    expect(people[0]).toHaveTextContent("Birthday in 3 days");
    expect(people[0]).toHaveTextContent("Last sent: Truffle Cake");
    expect(within(people[0]).getByRole("link", { name: "Send Ammi a gift" })).toHaveAttribute("href", "/send/a1?occasion=birthday");
    expect(people[1]).toHaveTextContent("Birthday in 41 days");
    expect(people[2]).toHaveTextContent("No dates saved");
    expect(screen.getByRole("link", { name: /420 points/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /CEB4A993/i })).toHaveAttribute("href", "/track/ceb4a993-0000");
  });

  it("leads with orders and invites saving people when there are none", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([]);
    render(<PeopleDashboard token="tok" firstName={null} />);
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Recent orders", "Your people"]);
    expect(screen.getByText(/we'll remind you a week before/)).toBeInTheDocument();
  });
});
