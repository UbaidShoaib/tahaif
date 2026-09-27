import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountPage from "@/app/account/page";
import { useAuthStore, type UserRead } from "@/stores/auth.store";
import { useCurrencyStore } from "@/stores/currency.store";
import { accountApi } from "@/lib/account";
import type * as AccountModule from "@/lib/account";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const removeCookie = vi.hoisted(() => vi.fn());
vi.mock("js-cookie", () => ({ default: { remove: removeCookie, set: vi.fn() } }));
vi.mock("@/lib/account", async (orig) => {
  const actual = await orig<typeof AccountModule>();
  return { ...actual, accountApi: { ...actual.accountApi, updateMe: vi.fn(), deleteAccount: vi.fn(), exportData: vi.fn() } };
});

const user: UserRead = {
  id: "u1", email: "ayesha@example.com", full_name: "Ayesha", role: "customer", locale: "en",
  currency_pref: "PKR", avatar_url: null, is_verified: true, created_at: "",
};

describe("AccountPage", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(accountApi.updateMe).mockReset();
    vi.mocked(accountApi.deleteAccount).mockReset();
    removeCookie.mockReset();
    useAuthStore.setState({ user: { ...user }, accessToken: "tok", isLoading: false });
    useCurrencyStore.setState({ currency: "PKR", rates: { PKR: "1", GBP: "0.002800" } });
  });

  it("asks signed-out visitors to sign in", () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    render(<AccountPage />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?callbackUrl=%2Faccount");
  });

  it("links to orders, addresses and loyalty", () => {
    render(<AccountPage />);
    expect(screen.getByRole("link", { name: "My Orders" })).toHaveAttribute("href", "/account/orders");
    expect(screen.getByRole("link", { name: "Addresses" })).toHaveAttribute("href", "/account/addresses");
    expect(screen.getByRole("link", { name: "Loyalty Points" })).toHaveAttribute("href", "/account/loyalty");
  });

  it("offers only currencies that can be priced", () => {
    render(<AccountPage />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["PKR", "GBP"]);
  });

  it("saves name and currency, then updates the session and display currency", async () => {
    vi.mocked(accountApi.updateMe).mockResolvedValue({ ...user, full_name: "Ayesha Khan", currency_pref: "GBP" });
    render(<AccountPage />);

    await userEvent.clear(screen.getByLabelText("Full name"));
    await userEvent.type(screen.getByLabelText("Full name"), "Ayesha Khan");
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "GBP");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(accountApi.updateMe).toHaveBeenCalledWith({ full_name: "Ayesha Khan", currency_pref: "GBP" }, "tok");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(useAuthStore.getState().user?.currency_pref).toBe("GBP");
    expect(useCurrencyStore.getState().currency).toBe("GBP");
  });

  it("only deletes the account after the confirmation word is typed", async () => {
    vi.mocked(accountApi.deleteAccount).mockResolvedValue(undefined);
    render(<AccountPage />);

    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    const confirm = screen.getByRole("button", { name: "Permanently delete account" });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), "DELETE");
    await userEvent.click(confirm);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(accountApi.deleteAccount).toHaveBeenCalledWith("tok");
    expect(removeCookie).toHaveBeenCalledWith("tahaif_session");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("keeps the buyer signed in and explains when deletion fails", async () => {
    vi.mocked(accountApi.deleteAccount).mockRejectedValue(new Error("500"));
    render(<AccountPage />);
    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    await userEvent.type(screen.getByLabelText(/Type DELETE to confirm/), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete your account");
    expect(useAuthStore.getState().user).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
