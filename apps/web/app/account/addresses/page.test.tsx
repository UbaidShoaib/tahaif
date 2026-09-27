import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddressesPage from "@/app/account/addresses/page";
import { useAuthStore } from "@/stores/auth.store";
import { accountApi, type AddressRead } from "@/lib/account";
import type * as AccountModule from "@/lib/account";

vi.mock("@/lib/account", async (orig) => {
  const actual = await orig<typeof AccountModule>();
  return {
    ...actual,
    accountApi: {
      ...actual.accountApi,
      listAddresses: vi.fn(), createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn(),
    },
  };
});

const ammi: AddressRead = {
  id: "a1", recipient_name: "Ammi Jaan", recipient_phone: "+923001234567", line1: "12 Main Boulevard",
  line2: null, city_name: "Lahore", landmark: "Near Liberty", alt_phone: null, is_default: true,
};
const khala: AddressRead = { ...ammi, id: "a2", recipient_name: "Khala", city_name: "Karachi", landmark: null, is_default: false };

describe("AddressesPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    for (const fn of [accountApi.listAddresses, accountApi.createAddress, accountApi.updateAddress, accountApi.deleteAddress]) {
      vi.mocked(fn).mockReset();
    }
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true, json: () => Promise.resolve([{ id: "c1", name: "Lahore" }, { id: "c2", name: "Karachi" }]),
    } as Response);
    useAuthStore.setState({ user: { id: "u1" } as never, accessToken: "tok", isLoading: false });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows an empty state with a way to add the first address", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([]);
    render(<AddressesPage />);
    expect(await screen.findByText(/No saved addresses yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add address" })).toBeInTheDocument();
  });

  it("lists addresses with the default marked", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([ammi, khala]);
    render(<AddressesPage />);
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText("Default")).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "Make default" })).toBeInTheDocument();
  });

  it("adds an address, defaulting the first one", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValueOnce([]).mockResolvedValue([ammi]);
    vi.mocked(accountApi.createAddress).mockResolvedValue(ammi);
    render(<AddressesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Add address" }));
    const save = screen.getByRole("button", { name: "Save address" });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Recipient name *"), " Ammi Jaan ");
    await userEvent.type(screen.getByLabelText("Recipient phone *"), "+923001234567");
    await userEvent.type(screen.getByLabelText("Address *"), "12 Main Boulevard");
    await userEvent.selectOptions(screen.getByLabelText("City *"), "Lahore");
    await userEvent.click(save);

    await waitFor(() => expect(accountApi.createAddress).toHaveBeenCalled());
    expect(vi.mocked(accountApi.createAddress).mock.calls[0]?.[0]).toMatchObject({
      recipient_name: "Ammi Jaan", city_name: "Lahore", is_default: true,
    });
    expect(await screen.findByText("Ammi Jaan")).toBeInTheDocument();
  });

  it("edits an address in place", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([ammi]);
    vi.mocked(accountApi.updateAddress).mockResolvedValue(ammi);
    render(<AddressesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByLabelText("Nearby landmark"));
    await userEvent.type(screen.getByLabelText("Nearby landmark"), "Opposite MM Alam Road");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(accountApi.updateAddress).toHaveBeenCalled());
    expect(vi.mocked(accountApi.updateAddress).mock.calls[0]?.slice(0, 1)).toEqual(["a1"]);
    expect(vi.mocked(accountApi.updateAddress).mock.calls[0]?.[1]).toMatchObject({ landmark: "Opposite MM Alam Road" });
  });

  it("makes another address the default", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([ammi, khala]);
    vi.mocked(accountApi.updateAddress).mockResolvedValue({ ...khala, is_default: true });
    render(<AddressesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Make default" }));
    expect(accountApi.updateAddress).toHaveBeenCalledWith("a2", { is_default: true }, "tok");
  });

  it("asks before deleting", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([ammi]);
    vi.mocked(accountApi.deleteAddress).mockResolvedValue(undefined);
    render(<AddressesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(accountApi.deleteAddress).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Ammi Jaan's address?")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(accountApi.deleteAddress).toHaveBeenCalledWith("a1", "tok");
  });

  it("saves who they are and their birthday", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValueOnce([]).mockResolvedValue([ammi]);
    vi.mocked(accountApi.createAddress).mockResolvedValue(ammi);
    render(<AddressesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Add address" }));
    await userEvent.click(screen.getByRole("button", { name: "Ammi" }));
    await userEvent.type(screen.getByLabelText("Recipient name *"), "Shabana Khan");
    await userEvent.type(screen.getByLabelText("Recipient phone *"), "+923001234567");
    await userEvent.type(screen.getByLabelText("Address *"), "12 Main Boulevard");
    await userEvent.selectOptions(screen.getByLabelText("City *"), "Lahore");
    await userEvent.selectOptions(screen.getByLabelText("Birthday month"), "3");
    await userEvent.selectOptions(screen.getByLabelText("Birthday day"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(accountApi.createAddress).toHaveBeenCalled());
    expect(vi.mocked(accountApi.createAddress).mock.calls[0]?.[0]).toMatchObject({
      relationship: "Ammi", birthday: { month: 3, day: 12 }, anniversary: null,
    });
  });

  it("shows who they are and flags a birthday coming up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 28, 12)); // 28 Sep 2026, local time
    try {
      vi.mocked(accountApi.listAddresses).mockResolvedValue([
        { ...ammi, relationship: "Ammi", birthday: { month: 10, day: 3 }, anniversary: { month: 12, day: 1 } },
        { ...khala, relationship: "Khala", birthday: { month: 6, day: 1 } },
      ]);
      render(<AddressesPage />);

      const [first, second] = await screen.findAllByRole("listitem");
      expect(within(first).getByText("Ammi")).toBeInTheDocument();
      expect(within(first).getByText("Birthday 3 Oct · Anniversary 1 Dec")).toBeInTheDocument();
      expect(within(first).getByText(/Birthday in 5 days \(3 Oct\)/)).toBeInTheDocument();
      // June is months away: listed, but not flagged as coming up.
      expect(within(second).getByText("Birthday 1 Jun")).toBeInTheDocument();
      expect(within(second).queryByText(/in \d+ days/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
