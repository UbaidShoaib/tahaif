"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  /** Called with the new quantity; 0 means "remove". */
  onChange: (qty: number) => void;
  /** Used in button labels, e.g. "Increase quantity of Red Roses". */
  itemName: string;
  max?: number;
  pending?: boolean;
  className?: string;
};

/**
 * − qty + control with 44px targets. At qty 1 the minus button becomes an
 * explicit "Remove" (trash icon) so removal is never a surprise.
 */
export function QuantityStepper({ value, onChange, itemName, max, pending, className }: Props) {
  const atMin = value <= 1;
  const atMax = max !== undefined && value >= max;
  const btn =
    "inline-flex h-11 w-11 items-center justify-center transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <div className={cn("inline-flex items-center rounded-lg border border-input", className)} aria-busy={pending || undefined}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={pending}
        className={cn(btn, "rounded-s-lg", atMin && "hover:text-destructive")}
        aria-label={atMin ? `Remove ${itemName}` : `Decrease quantity of ${itemName}`}
      >
        {atMin ? <Trash2 aria-hidden className="h-4 w-4" /> : <Minus aria-hidden className="h-4 w-4" />}
      </button>
      <span aria-live="polite" className="min-w-8 px-1 text-center text-sm font-medium tabular-nums">
        <span className="sr-only">Quantity </span>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={pending || atMax}
        className={cn(btn, "rounded-e-lg")}
        aria-label={`Increase quantity of ${itemName}`}
      >
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
