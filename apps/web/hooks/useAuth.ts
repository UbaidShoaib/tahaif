"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";

export function useAuth() {
  const store = useAuthStore();
  return store;
}

export function useAuthInit() {
  const { refresh, isLoading } = useAuthStore();

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isLoading };
}
