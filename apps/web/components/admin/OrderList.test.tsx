import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderList, ordersQuery, orderCode, PAGE_SIZE, type OrderSummary } from "@/components/admin/OrderList";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const order: OrderSummary = {
  id: "o1",
  public_token: "3f9a2c1b-0000-4000-8000-000000000000",
  status: "pending_payment",
  next_statuses: ["paid", "preparing", "cancelled", "on_hold"],
  user_id: null,
  total_pkr: 550000,
  currency: "PKR",
  placed_at: "2026-10-16T09:00:00Z",
  payment_method: "bank_transfer",
  payment_status: "awaiting_verification",
  proof_url: "https://signed.example/receipt.jpg",
  source: "instagram",
  buyer_name: "Sara (London)",
  buyer_phone: "+447700123456",
  recipients: ["Ammi Jaan"],
  delivery_date: "2026-10-18",
  customer_confirmed_at: null,
};

const page = (items: OrderSummary[], total = items.length, offset = 0) => ({ items, total, offset, limit: PAGE_SIZE });

function serveOrders(...pages: ReturnType<typeof page>[]) {
  const queue = [...pages];
  vi.mocked(apiFetch).mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/admin/orders?") ? (queue.length > 1 ? queue.shift() : queue[0]) : {}),
  );
}

const lastListCall = () =>
  vi.mocked(apiFetch).mock.calls.map(([p]) => p).filter((p) => p.startsWith("/admin/orders?")).at(-1);

describe("ordersQuery", () => {
  it("sends only the filters that are set", () => {
    expect(ordersQuery({ status: "", q: "", from: "", to: "", offset: 0 })).toBe(`/admin/orders?limit=${PAGE_SIZE}`);
    expect(ordersQuery({ status: "paid", q: " 0300 1234567 ", from: "2026-10-01", to: "2026-10-07", offset: 25 }))
      .toBe("/admin/orders?status=paid&q=0300+1234567&placed_from=2026-10-01&placed_to=2026-10-07&offset=25&limit=25");
  });

  it("shows the code as printed on receipts", () => {
    expect(orderCode(order.public_token)).toBe("3F9A2C1B");
  });
});

describe("OrderList", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows who the order is for, from and when it is delivered", async () => {
    serveOrders(page([order]));
    render(<OrderList token="tok" />);

    expect(await screen.findByRole("link", { name: "#3F9A2C1B" })).toHaveAttribute("href", "/admin/orders/o1");
    expect(screen.getByRole("link", { name: "Open order 3F9A2C1B" })).toHaveAttribute("href", "/admin/orders/o1");
    expect(screen.getByText(/To Ammi Jaan/)).toHaveTextContent("deliver Sun, 18 Oct");
    expect(screen.getByText("From Sara (London) · +447700123456")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1–1 of 1 order");
  });

  it("searches once typing stops and starts from the first page", async () => {
    serveOrders(page([order]));
    render(<OrderList token="tok" />);
    await screen.findByText("#3F9A2C1B");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search orders" }), "0300 1234567");

    await waitFor(() => expect(lastListCall()).toBe("/admin/orders?q=0300+1234567&limit=25"));
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/orders?q=0&limit=25", expect.anything());
  });

  it("filters by status and placed dates", async () => {
    serveOrders(page([order]));
    render(<OrderList token="tok" />);
    await screen.findByText("#3F9A2C1B");

    await userEvent.click(screen.getByRole("button", { name: "paid" }));
    await userEvent.type(screen.getByLabelText("Placed from"), "2026-10-01");

    await waitFor(() => expect(lastListCall()).toBe("/admin/orders?status=paid&placed_from=2026-10-01&limit=25"));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastListCall()).toBe("/admin/orders?limit=25"));
  });

  it("pages through results", async () => {
    const many = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...order, id: `o${i}`, public_token: `${i}`.padStart(8, "0") }));
    serveOrders(page(many, 30), page([order], 30, PAGE_SIZE));
    render(<OrderList token="tok" />);
    expect(await screen.findByRole("status")).toHaveTextContent("1–25 of 30 orders");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(lastListCall()).toBe("/admin/orders?offset=25&limit=25"));
    expect(await screen.findByRole("status")).toHaveTextContent("26–26 of 30 orders");
  });

  it("says when nothing matches a search", async () => {
    serveOrders(page([order]), page([]));
    render(<OrderList token="tok" />);
    await screen.findByText("#3F9A2C1B");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search orders" }), "nobody");

    expect(await screen.findByText("No orders match.")).toBeInTheDocument();
  });

  it("approves a payment proof and reloads", async () => {
    serveOrders(page([order]));
    render(<OrderList token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: /Approve/ }));

    expect(apiFetch).toHaveBeenCalledWith("/admin/orders/o1/verify-payment", {
      method: "POST", token: "tok", body: { verified: true },
    });
  });

  it("changes status and reports a failure", async () => {
    serveOrders(page([order]));
    render(<OrderList token="tok" />);
    const select = await screen.findByRole("combobox", { name: "Status of order 3F9A2C1B" });
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(409, "Not allowed from pending payment"));

    await userEvent.selectOptions(select, "preparing");

    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed from pending payment");
  });

  it("offers only the statuses the order may move to", async () => {
    serveOrders(page([order, { ...order, id: "o2", public_token: "aaaa1111-0000", status: "cancelled", next_statuses: [] }]));
    render(<OrderList token="tok" />);
    const select = await screen.findByRole("combobox", { name: "Status of order 3F9A2C1B" });

    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["pending_payment", "paid", "preparing", "cancelled", "on_hold"]);
    expect(screen.getByRole("combobox", { name: "Status of order AAAA1111" })).toBeDisabled();
  });
});
