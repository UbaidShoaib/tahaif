"use client";

import { create } from "zustand";
import { catalogApi, type City } from "@/lib/catalog";

const STORAGE_KEY = "tahaif_deliver_to";

interface DeliveryState {
  /** Active delivery cities, loaded once. */
  cities: City[];
  /** The buyer's chosen "Deliver to" city, remembered across visits. Null = not chosen. */
  cityId: string | null;
  /**
   * A saved person to preselect at checkout, set by a reminder's "send again"
   * link (/send/{addressId}). In memory only: it's a one-off shortcut.
   */
  sendToAddressId: string | null;
  loadCities: () => Promise<void>;
  setCity: (cityId: string | null) => void;
  setSendTo: (addressId: string | null) => void;
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(cityId: string | null) {
  try {
    if (cityId) window.localStorage.setItem(STORAGE_KEY, cityId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode): the choice just isn't remembered */
  }
}

let loading: Promise<void> | null = null;

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  cities: [],
  cityId: typeof window === "undefined" ? null : readStored(),
  sendToAddressId: null,

  loadCities: () => {
    if (get().cities.length > 0) return Promise.resolve();
    loading ??= catalogApi
      .getCities()
      .then((all) => {
        const cities = all.filter((c) => c.is_active);
        // Forget a remembered city that no longer delivers.
        const { cityId } = get();
        const stillValid = cityId && cities.some((c) => c.id === cityId);
        set({ cities, cityId: stillValid ? cityId : null });
        if (!stillValid) writeStored(null);
      })
      .catch(() => {
        /* offline or API down: the picker simply hides */
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  },

  setCity: (cityId) => {
    writeStored(cityId);
    set({ cityId });
  },

  setSendTo: (sendToAddressId) => set({ sendToAddressId }),
}));

/** Name of the chosen city, if any. */
export function useDeliveryCityName() {
  return useDeliveryStore((s) => s.cities.find((c) => c.id === s.cityId)?.name ?? null);
}
