"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `intervalMs` while `active` and the tab is visible, and once
 * more when the tab becomes visible again. Hidden tabs and settled orders cost nothing.
 */
export function usePolling(fn: () => void, active: boolean, intervalMs = 20_000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id === undefined) id = setInterval(() => fnRef.current(), intervalMs);
    };
    const stop = () => {
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fnRef.current();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, intervalMs]);
}
