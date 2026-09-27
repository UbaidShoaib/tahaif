import { z } from "zod";

/** Today's date in the buyer's local time zone, as YYYY-MM-DD (what <input type="date"> uses). */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional();

/**
 * Delivery form rules. Lengths mirror the API's CheckoutPlace schema
 * (apps/api/app/schemas/order.py) so the browser never accepts what the
 * server would reject. Messages say how to fix the problem, not just what's wrong.
 */
export const checkoutSchema = z
  .object({
    /** Set by the page from auth state; guests must give contact details (ADR 0004). */
    is_guest: z.boolean(),
    contact_email: z.string().trim().max(255, "Email must be 255 characters or fewer").optional(),
    contact_phone: z
      .string()
      .trim()
      .max(30, "Phone number must be 30 characters or fewer")
      .optional(),
    payment_method: z.enum(["cod", "bank_transfer"]),
    delivery_city_id: z.string().min(1, "Choose the city we're delivering to"),
    delivery_date: z
      .string()
      .min(1, "Choose a delivery date")
      .refine((d) => d >= localToday(), "Choose today or a later date"),
    recipient_name: z
      .string()
      .trim()
      .min(2, "Enter the recipient's full name")
      .max(255, "Name must be 255 characters or fewer"),
    recipient_phone: z
      .string()
      .trim()
      .min(7, "Enter a phone number the rider can call, e.g. +92 300 1234567")
      .max(30, "Phone number must be 30 characters or fewer")
      .regex(/^\+?[\d\s()-]+$/, "Use digits only, with an optional + for the country code"),
    address_line1: z
      .string()
      .trim()
      .min(5, "Enter the house number, street and area")
      .max(500, "Address must be 500 characters or fewer"),
    address_line2: optional(255, "Apartment / floor"),
    landmark: optional(255, "Landmark"),
    notes: optional(500, "Notes"),
    /** Name used in WhatsApp messages to the recipient ("A gift from Ali"). */
    gift_from: optional(80, "Your name for the recipient"),
    /** No message before delivery; the rider doesn't call ahead. */
    surprise: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.is_guest) return;
    const email = v.contact_email ?? "";
    if (!email) {
      ctx.addIssue({
        code: "custom",
        path: ["contact_email"],
        message: "Enter your email for the order confirmation",
      });
    } else if (!z.string().email().safeParse(email).success) {
      ctx.addIssue({
        code: "custom",
        path: ["contact_email"],
        message: "Enter an email like name@example.com",
      });
    }
    const phone = v.contact_phone ?? "";
    if (phone.length < 7) {
      ctx.addIssue({
        code: "custom",
        path: ["contact_phone"],
        message: "Enter a phone number we can reach you on, e.g. +44 7700 900123",
      });
    } else if (!/^\+?[\d\s()-]+$/.test(phone)) {
      ctx.addIssue({
        code: "custom",
        path: ["contact_phone"],
        message: "Use digits only, with an optional + for the country code",
      });
    }
  });

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;

/** Field order for the error summary, matching the order on screen. */
export const FIELD_ORDER: { name: keyof CheckoutFormValues; label: string }[] = [
  { name: "contact_email", label: "Your email" },
  { name: "contact_phone", label: "Your phone" },
  { name: "delivery_city_id", label: "Delivery city" },
  { name: "delivery_date", label: "Delivery date" },
  { name: "recipient_name", label: "Recipient name" },
  { name: "recipient_phone", label: "Recipient phone" },
  { name: "address_line1", label: "Address" },
  { name: "address_line2", label: "Apartment / floor" },
  { name: "landmark", label: "Landmark" },
  { name: "notes", label: "Notes" },
  { name: "payment_method", label: "Payment method" },
];
