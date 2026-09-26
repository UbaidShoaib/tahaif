"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  applied: string | null;
  error: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
};

export function CouponField({ applied, error, onApply, onRemove }: Props) {
  const [input, setInput] = useState("");
  const apply = () => {
    const code = input.trim().toUpperCase();
    if (code) onApply(code);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="coupon">Coupon code</Label>
      {applied ? (
        <div className="flex items-center justify-between rounded-md border border-success/40 bg-success-soft px-3 py-1 text-sm">
          <span className="font-mono font-medium text-success-foreground">{applied}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onRemove();
              setInput("");
            }}
            aria-label={`Remove coupon ${applied}`}
          >
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            id="coupon"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter applies the coupon instead of submitting the whole order.
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            placeholder="EID10"
            autoCapitalize="characters"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "coupon-error" : undefined}
          />
          <Button type="button" variant="outline" onClick={apply} disabled={!input.trim()}>
            Apply
          </Button>
        </div>
      )}
      {error && (
        <p id="coupon-error" role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
