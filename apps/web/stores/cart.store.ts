"use client";

import { create } from "zustand";
import { cartApi, type CartRead, type CartItemAdd, type CartItemUpdate } from "@/lib/cart";
import { useAuthStore } from "@/stores/auth.store";
import { getGuestCartToken } from "@/lib/guest-cart";

interface CartState {
  cart: CartRead | null;
  isDrawerOpen: boolean;
  isFetching: boolean;
  fetchCart: () => Promise<void>;
  addItem: (body: CartItemAdd) => Promise<void>;
  updateItem: (itemId: string, body: CartItemUpdate) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
}

function getToken(): string | null {
  return useAuthStore.getState().accessToken;
}

export const useCartStore = create<CartState>((set) => ({
  cart: null,
  isDrawerOpen: false,
  isFetching: false,

  fetchCart: async () => {
    const token = getToken();
    // Guests without a cart token have nothing to fetch (the API would return an empty cart).
    if (!token && !getGuestCartToken()) return;
    set({ isFetching: true });
    try {
      const cart = await cartApi.get(token);
      set({ cart });
    } catch {
      // Keep whatever we had; the next action will surface a real error.
    } finally {
      set({ isFetching: false });
    }
  },

  addItem: async (body) => {
    const token = getToken();
    const cart = await cartApi.addItem(body, token);
    set({ cart, isDrawerOpen: true });
  },

  updateItem: async (itemId, body) => {
    const token = getToken();
    const cart = await cartApi.updateItem(itemId, body, token);
    set({ cart });
  },

  removeItem: async (itemId) => {
    const token = getToken();
    const cart = await cartApi.removeItem(itemId, token);
    set({ cart });
  },

  clearCart: async () => {
    const token = getToken();
    const cart = await cartApi.clear(token);
    set({ cart });
  },

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
}));
