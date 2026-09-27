import { brand } from "@/lib/brand";

/**
 * How the printed card will look. `dir="auto"` lays Urdu out right-to-left and
 * the Naskh font is picked up per glyph (tailwind font-display), so the buyer
 * sees their Urdu message the way the family will.
 */
export function CardPreview({ message, compact = false }: { message: string; compact?: boolean }) {
  const text = message.trim();
  return (
    <figure
      aria-label="Card preview"
      className={`relative mx-auto w-full max-w-xs rounded-xl border-2 border-gold bg-background shadow-sm ${compact ? "p-4" : "p-6"}`}
    >
      <div aria-hidden className="absolute inset-1.5 rounded-lg border border-gold/40" />
      <blockquote
        dir="auto"
        className={`relative whitespace-pre-wrap break-words text-center font-display leading-relaxed ${
          text ? "text-foreground" : "italic text-muted-foreground"
        } ${compact ? "text-sm" : "text-base"}`}
      >
        {text || "Your message will appear here"}
      </blockquote>
      <figcaption className="relative mt-3 text-center text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {brand.name}
      </figcaption>
    </figure>
  );
}
