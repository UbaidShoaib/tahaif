import { describe, it, expect } from "vitest";
import { parseHours, whatsappDigits, whatsappLink } from "@/lib/support";

describe("support config", () => {
  it("keeps only the digits of an international number", () => {
    expect(whatsappDigits("+92 300 123-4567")).toBe("923001234567");
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
    expect(whatsappDigits("12")).toBeNull();
  });

  it("parses opening hours, falling back to 9am–9pm", () => {
    expect(parseHours("8:30-22:00")).toEqual({ open: "08:30", close: "22:00" });
    expect(parseHours("whenever")).toEqual({ open: "09:00", close: "21:00" });
  });

  it("builds a wa.me link with an encoded message", () => {
    expect(whatsappLink("923001234567")).toBe("https://wa.me/923001234567");
    expect(whatsappLink("923001234567", "Hi & thanks")).toBe("https://wa.me/923001234567?text=Hi%20%26%20thanks");
  });
});
