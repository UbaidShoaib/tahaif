"use client";

import { create } from "zustand";
import { cartApi, type CartRead, type CartItemAdd, type CartItemUpdate } from "@/lib/cart";
import { useAuthStore } from "@/stores/auth.store";

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
    if (!token) return;
    set({ isFetching: true });
    try {
      const cart = await cartApi.get(token);
      set({ cart });
    } catch {
      // silently fail — user may not be logged in
    } finally {
      set({ isFetching: false });
    }
  },

  addItem: async (body) => {
    const token = getToken();
    if (!token) return;
    const cart = await cartApi.addItem(body, token);
    set({ cart, isDrawerOpen: true });
  },

  updateItem: async (itemId, body) => {
    const token = getToken();
    if (!token) return;
    const cart = await cartApi.updateItem(itemId, body, token);
    set({ cart });
  },

  removeItem: async (itemId) => {
    const token = getToken();
    if (!token) return;
    const cart = await cartApi.removeItem(itemId, token);
    set({ cart });
  },

  clearCart: async () => {
    const token = getToken();
    if (!token) return;
    const cart = await cartApi.clear(token);
    set({ cart });
  },

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
}));
