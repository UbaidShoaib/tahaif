"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FieldControlProps = {
  id: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

type Props = {
  label: React.ReactNode;
  /** Help text shown under the control and linked with aria-describedby. */
  hint?: React.ReactNode;
  /** Error message; marks the control invalid and is announced. */
  error?: string | null;
  required?: boolean;
  /** Override the generated id, e.g. when tests or E2E rely on a stable one. */
  id?: string;
  className?: string;
  /** Render prop so any control (Input, Select, Textarea, custom) gets wired up. */
  children: (control: FieldControlProps) => React.ReactNode;
};

/**
 * Label + control + hint + error, with ids and ARIA wiring generated for you.
 *
 *   <FormField label="Recipient phone" required error={errors.phone}>
 *     {(p) => <Input type="tel" {...p} {...register("phone")} />}
 *   </FormField>
 */
export function FormField({ label, hint, error, required, id, className, children }: Props) {
  const generated = React.useId();
  const controlId = id ?? generated;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required && (
          <>
            <span aria-hidden className="text-destructive"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </Label>
      {children({
        id: controlId,
        required,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
