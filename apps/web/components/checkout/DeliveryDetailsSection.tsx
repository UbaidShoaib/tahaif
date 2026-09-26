"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { AddressRead } from "@/lib/account";
import type { CheckoutFormValues } from "@/components/checkout/checkout-schema";

export type CheckoutCity = { id: string; name: string; slug: string; is_active: boolean };

type Props = {
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
  cities: CheckoutCity[];
  addresses: AddressRead[];
  /** "" = entering a new address. */
  selectedAddressId: string;
  onSelectAddress: (id: string) => void;
  minDate: string;
  /** Lets the parent sync the city to the Deliver-to store. */
  onCityChange: (cityId: string) => void;
};

export function DeliveryDetailsSection({
  register,
  errors,
  cities,
  addresses,
  selectedAddressId,
  onSelectAddress,
  minDate,
  onCityChange,
}: Props) {
  const city = register("delivery_city_id");

  return (
    <section aria-labelledby="delivery-heading" className="space-y-5 rounded-xl border bg-card p-5">
      <h2 id="delivery-heading" className="text-h3">
        Recipient &amp; delivery
      </h2>

      {addresses.length > 0 && (
        <RadioGroup
          legend="Send to a saved address"
          value={selectedAddressId}
          onValueChange={onSelectAddress}
          className="grid gap-2 sm:grid-cols-2"
        >
          {addresses.map((a) => (
            <RadioCard key={a.id} value={a.id}>
              <span className="block font-medium">
                {a.recipient_name}
                {a.is_default && <span className="ms-2 text-xs font-normal text-muted-foreground">Default</span>}
              </span>
              <span className="block text-sm text-muted-foreground">
                {a.line1}, {a.city_name}
              </span>
            </RadioCard>
          ))}
          <RadioCard value="">
            <span className="block font-medium">A new address</span>
            <span className="block text-sm text-muted-foreground">Enter the details below</span>
          </RadioCard>
        </RadioGroup>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Delivery city" required id="delivery_city_id" error={errors.delivery_city_id?.message}>
          {(p) => (
            <Select
              {...p}
              {...city}
              onChange={(e) => {
                void city.onChange(e);
                onCityChange(e.target.value);
              }}
            >
              <option value="">Select city…</option>
              {cities
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
        </FormField>
        <FormField label="Delivery date" required id="delivery_date" error={errors.delivery_date?.message}>
          {(p) => <Input {...p} type="date" min={minDate} {...register("delivery_date")} />}
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Recipient name" required id="recipient_name" error={errors.recipient_name?.message}>
          {(p) => (
            <Input {...p} autoComplete="shipping name" placeholder="Full name of recipient" {...register("recipient_name")} />
          )}
        </FormField>
        <FormField
          label="Recipient phone"
          required
          id="recipient_phone"
          hint="The rider calls this number on arrival."
          error={errors.recipient_phone?.message}
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="shipping tel"
              placeholder="+92 300 1234567"
              {...register("recipient_phone")}
            />
          )}
        </FormField>
      </div>

      <FormField label="Address" required id="address_line1" error={errors.address_line1?.message}>
        {(p) => (
          <Input
            {...p}
            autoComplete="shipping address-line1"
            placeholder="House/flat, street, area"
            {...register("address_line1")}
          />
        )}
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Apartment / floor" hint="Optional" id="address_line2" error={errors.address_line2?.message}>
          {(p) => (
            <Input {...p} autoComplete="shipping address-line2" placeholder="e.g. Flat 3B" {...register("address_line2")} />
          )}
        </FormField>
        <FormField label="Nearby landmark" hint="Optional — helps riders in areas without street numbers." id="landmark" error={errors.landmark?.message}>
          {(p) => <Input {...p} placeholder="e.g. Near Liberty Market" {...register("landmark")} />}
        </FormField>
      </div>

      <FormField label="Notes for the rider" hint="Optional" id="notes" error={errors.notes?.message}>
        {(p) => <Textarea {...p} rows={2} placeholder="Special instructions for delivery" {...register("notes")} />}
      </FormField>
    </section>
  );
}
