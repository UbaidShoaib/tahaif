import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDeliveryStore } from "@/stores/delivery.store";
import { catalogApi } from "@/lib/catalog";

vi.mock("@/lib/catalog", () => ({ catalogApi: { getCities: vi.fn() } }));

const LHR = { id: "lhr", name: "Lahore", slug: "lahore", timezone: "Asia/Karachi", is_active: true };
const KHI = { id: "khi", name: "Karachi", slug: "karachi", timezone: "Asia/Karachi", is_active: true };
const OLD = { id: "old", name: "Closed City", slug: "closed", timezone: "Asia/Karachi", is_active: false };

describe("delivery store", () => {
  beforeEach(() => {
    localStorage.clear();
    useDeliveryStore.setState({ cities: [], cityId: null });
    vi.mocked(catalogApi.getCities).mockReset();
  });

  it("loads only active cities", async () => {
    vi.mocked(catalogApi.getCities).mockResolvedValue([LHR, KHI, OLD]);
    await useDeliveryStore.getState().loadCities();
    expect(useDeliveryStore.getState().cities.map((c) => c.id)).toEqual(["lhr", "khi"]);
  });

  it("remembers the chosen city", () => {
    useDeliveryStore.getState().setCity("lhr");
    expect(useDeliveryStore.getState().cityId).toBe("lhr");
    expect(localStorage.getItem("tahaif_deliver_to")).toBe("lhr");
    useDeliveryStore.getState().setCity(null);
    expect(localStorage.getItem("tahaif_deliver_to")).toBeNull();
  });

  it("forgets a remembered city that no longer delivers", async () => {
    useDeliveryStore.getState().setCity("old");
    vi.mocked(catalogApi.getCities).mockResolvedValue([LHR, OLD]);
    await useDeliveryStore.getState().loadCities();
    expect(useDeliveryStore.getState().cityId).toBeNull();
    expect(localStorage.getItem("tahaif_deliver_to")).toBeNull();
  });

  it("survives the API being down", async () => {
    vi.mocked(catalogApi.getCities).mockRejectedValue(new Error("down"));
    await useDeliveryStore.getState().loadCities();
    expect(useDeliveryStore.getState().cities).toEqual([]);
  });
});
