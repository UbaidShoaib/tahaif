"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";

export function useAuth() {
  const store = useAuthStore();
  return store;
}

export function useAuthInit() {
  const { restoreSession, isLoading } = useAuthStore();

  useEffect(() => {
    void restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isLoading };
}
