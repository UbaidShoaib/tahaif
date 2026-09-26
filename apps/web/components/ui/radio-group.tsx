"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type RadioGroupContext = {
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
};

const Ctx = React.createContext<RadioGroupContext | null>(null);

type GroupProps = {
  /** Visible group label, rendered as the fieldset legend. */
  legend: React.ReactNode;
  /** Hide the legend visually but keep it for screen readers. */
  hideLegend?: boolean;
  name?: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
};

/**
 * A fieldset of native radio inputs. Native radios give arrow-key navigation,
 * a single tab stop and form semantics for free; RadioCard / RadioChip only
 * restyle them.
 */
export function RadioGroup({ legend, hideLegend, name, value, onValueChange, className, children }: GroupProps) {
  const generated = React.useId();
  return (
    <fieldset className="min-w-0">
      <legend className={cn("mb-2 text-sm font-medium", hideLegend && "sr-only")}>{legend}</legend>
      <Ctx.Provider value={{ name: name ?? generated, value, onChange: onValueChange }}>
        <div className={className}>{children}</div>
      </Ctx.Provider>
    </fieldset>
  );
}

type ItemProps = {
  value: string;
  disabled?: boolean;
  /** Extra text for screen readers when disabled, e.g. "sold out". */
  disabledReason?: string;
  className?: string;
  children: React.ReactNode;
};

function useRadio(value: string) {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("Radio items must be used inside <RadioGroup>");
  return { ...ctx, checked: ctx.value === value };
}

/** Large selectable card: payment method, delivery slot, saved address. */
export function RadioCard({ value, disabled, disabledReason, className, children }: ItemProps) {
  const { name, checked, onChange } = useRadio(value);
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked ? "border-primary bg-primary-soft" : "border-input hover:border-primary-400",
        disabled && "cursor-not-allowed opacity-60 hover:border-input",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        {children}
        {disabled && disabledReason && <span className="sr-only"> ({disabledReason})</span>}
      </span>
    </label>
  );
}

/** Compact pill: variant size, city filter. Disabled chips are struck through, not just faded. */
export function RadioChip({ value, disabled, disabledReason, className, children }: ItemProps) {
  const { name, checked, onChange } = useRadio(value);
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-input hover:border-primary-400",
        disabled && "cursor-not-allowed text-muted-foreground line-through hover:border-input",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {checked && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
      {children}
      {disabled && disabledReason && <span className="sr-only"> ({disabledReason})</span>}
    </label>
  );
}
