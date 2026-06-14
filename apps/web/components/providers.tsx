"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth.store";

// ── PostHog (lightweight, tree-shaken when key absent) ────────────────────────
const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

let posthog: { capture: (event: string, props?: Record<string, unknown>) => void } | null = null;

if (typeof window !== "undefined" && PH_KEY) {
  import("posthog-js").then((mod) => {
    const ph = mod.default;
    ph.init(PH_KEY, { api_host: PH_HOST, capture_pageview: false });
    posthog = ph;
  }).catch(() => { /* posthog unavailable */ });
}

export function captureEvent(event: string, props?: Record<string, unknown>) {
  posthog?.capture(event, props);
}

// ── Route-change pageview ────────────────────────────────────────────────────
function PostHogPageview() {
  const pathname = useRef<string>("");

  useEffect(() => {
    if (!PH_KEY) return;
    const current = window.location.pathname;
    if (current !== pathname.current) {
      pathname.current = current;
      posthog?.capture("$pageview", { $current_url: window.location.href });
    }
  });

  return null;
}

// ── Auth initializer ──────────────────────────────────────────────────────────
function AuthInitializer() {
  const refresh = useAuthStore((s) => s.refresh);
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthInitializer />
        <PostHogPageview />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
