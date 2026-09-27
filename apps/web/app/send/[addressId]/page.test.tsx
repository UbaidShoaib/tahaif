import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SendToPage from "@/app/send/[addressId]/page";
import { useAuthStore } from "@/stores/auth.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { accountApi, type AddressRead } from "@/lib/account";
import type * as AccountModule from "@/lib/account";

const replace = vi.fn();
let search = "occasion=birthday";
vi.mock("next/navigation", () => ({
  useParams: () => ({ addressId: "a1" }),
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/account", async (orig) => {
  const actual = await orig<typeof AccountModule>();
  return { ...actual, accountApi: { ...actual.accountApi, listAddresses: vi.fn() } };
});

const ammi: AddressRead = {
  id: "a1", recipient_name: "Shabana Khan", recipient_phone: "+923001234567", line1: "12 Main Boulevard",
  line2: null, city_name: "Lahore", landmark: null, alt_phone: null, is_default: false, relationship: "Ammi",
};
const LAHORE = { id: "city-lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true };

describe("SendToPage", () => {
  beforeEach(() => {
    replace.mockReset();
    search = "occasion=birthday";
    vi.mocked(accountApi.listAddresses).mockReset().mockResolvedValue([ammi]);
    useAuthStore.setState({ user: { id: "u1" } as never, accessToken: "tok", isLoading: false });
    useDeliveryStore.setState({ cities: [LAHORE], cityId: null, sendToAddressId: null });
  });

  it("delivers to that person's city, preselects them and opens the occasion's gifts", async () => {
    render(<SendToPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/occasion/birthday"));
    expect(useDeliveryStore.getState().cityId).toBe("city-lhr");
    expect(useDeliveryStore.getState().sendToAddressId).toBe("a1");
  });

  it("falls back to the home page for an unknown occasion", async () => {
    search = "occasion=../../admin";
    render(<SendToPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("asks a signed-out buyer to sign in and come back", async () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    render(<SendToPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?callbackUrl=%2Fsend%2Fa1%3Foccasion%3Dbirthday"),
    );
  });

  it("explains when the person was removed", async () => {
    vi.mocked(accountApi.listAddresses).mockResolvedValue([]);
    render(<SendToPage />);
    expect(await screen.findByText(/couldn.t find that person/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
