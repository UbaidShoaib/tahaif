"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { create } from "zustand";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Optional action, e.g. Undo or "View cart". */
  action?: { label: string; onClick: () => void };
  /** Milliseconds. Toasts with an action stay at least 8s so they can be reached by keyboard. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number; open: boolean };

type ToastStore = {
  toasts: ToastItem[];
  push: (t: ToastInput) => number;
  dismiss: (id: number) => void;
  remove: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    // Keep at most 3 on screen.
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id, open: true }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)) })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a toast from anywhere (components, stores, event handlers). */
export function toast(input: ToastInput) {
  return useToastStore.getState().push(input);
}

const ICONS: Record<ToastVariant, typeof Info> = { success: CheckCircle2, error: AlertCircle, info: Info };
const STYLES: Record<ToastVariant, string> = {
  success: "[&_[data-icon]]:text-success",
  error: "border-destructive/40 [&_[data-icon]]:text-destructive",
  info: "[&_[data-icon]]:text-info",
};

/** Mount once, in Providers. */
export function Toaster() {
  const { toasts, dismiss, remove } = useToastStore();

  return (
    <ToastPrimitive.Provider swipeDirection="right" label="Notifications">
      {toasts.map((t) => {
        const variant = t.variant ?? "info";
        const Icon = ICONS[variant];
        const duration = t.duration ?? (t.action ? 8000 : 5000);
        return (
          <ToastPrimitive.Root
            key={t.id}
            open={t.open}
            duration={duration}
            // Errors interrupt; everything else waits politely.
            type={variant === "error" ? "foreground" : "background"}
            onOpenChange={(open) => {
              if (!open) {
                dismiss(t.id);
                setTimeout(() => remove(t.id), 300);
              }
            }}
            className={cn(
              "pointer-events-auto relative flex w-full items-start gap-3 rounded-xl border bg-card p-4 pe-10 text-card-foreground shadow-lg",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
              "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:animate-out",
              STYLES[variant],
            )}
          >
            <Icon data-icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="text-sm text-muted-foreground">
                  {t.description}
                </ToastPrimitive.Description>
              )}
              {t.action && (
                <ToastPrimitive.Action
                  altText={t.action.label}
                  onClick={t.action.onClick}
                  className="mt-1 inline-flex min-h-9 items-center rounded-md px-2 -ms-2 text-sm font-semibold text-link hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.action.label}
                </ToastPrimitive.Action>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="absolute end-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed bottom-0 end-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:max-w-sm" />
    </ToastPrimitive.Provider>
  );
}
