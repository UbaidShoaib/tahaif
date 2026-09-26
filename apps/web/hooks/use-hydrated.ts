"use client";

import { useEffect, useState } from "react";

/**
 * False during server render and the first client render, true once React has
 * hydrated. react-hook-form resets each field to its default when it registers
 * on hydration, which erases anything typed into the server-rendered form, so
 * forms disable their controls until this is true.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
