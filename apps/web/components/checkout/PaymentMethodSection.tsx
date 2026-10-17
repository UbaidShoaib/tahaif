"use client";

import { Banknote, Landmark } from "lucide-react";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PaymentMethod } from "@/lib/cart";
import { brand } from "@/lib/brand";

const METHODS: { value: PaymentMethod; label: string; desc: string; icon: typeof Banknote }[] = [
  { value: "cod", label: "Cash on Delivery", desc: "Pay the rider in rupees when the gift arrives", icon: Banknote },
  { value: "bank_transfer", label: "Bank Transfer", desc: "Transfer, then upload your receipt", icon: Landmark },
];

export function PaymentMethodSection({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <section aria-labelledby="payment-heading" className="space-y-4 border-t pt-8">
      <h2 id="payment-heading" className="text-h3">
        Payment
      </h2>
      <RadioGroup
        legend="Payment method"
        hideLegend
        name="payment_method"
        value={value}
        onValueChange={(v) => onChange(v as PaymentMethod)}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {METHODS.map(({ value: v, label, desc, icon: Icon }) => (
          <RadioCard key={v} value={v}>
            <span className="flex items-center gap-2 font-medium">
              <Icon aria-hidden className="h-4 w-4 text-gold-ink" />
              {label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
          </RadioCard>
        ))}
      </RadioGroup>

      {value === "bank_transfer" && (
        <Alert variant="info">
          <Landmark aria-hidden className="h-4 w-4" />
          <AlertTitle>Bank transfer details</AlertTitle>
          <AlertDescription>
            <p>Account: {brand.bankAccountName}</p>
            <p className="font-mono">IBAN: {process.env.NEXT_PUBLIC_BANK_IBAN ?? "—"}</p>
            <p className="mt-1">
              After placing your order, transfer the total and upload your receipt on the confirmation page.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
