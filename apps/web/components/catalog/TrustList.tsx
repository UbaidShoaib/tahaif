import { Banknote, CalendarCheck, Leaf, MapPinned, MessageSquareHeart } from "lucide-react";

// Only claims the service actually makes today. Add refund/replacement promises
// here once the Refund Policy page publishes them (it currently says "Coming soon").
const ITEMS = [
  { icon: Leaf, text: "Freshness promise on cakes and flowers" },
  { icon: MessageSquareHeart, text: "Your message printed on a card with the gift" },
  { icon: Banknote, text: "Cash on delivery or bank transfer" },
  { icon: MapPinned, text: "Track the delivery online" },
];

/**
 * Reassurance next to the buy button. Icons are decorative; the text carries the meaning.
 * `onTimePercent` is the shop's measured rate (GET /stats/on-time), shown only when
 * there's enough history: a measured fact, not a guarantee (docs/questions.md Q17).
 */
export function TrustList({ onTimePercent = null }: { onTimePercent?: number | null }) {
  const items =
    onTimePercent === null
      ? ITEMS
      : [{ icon: CalendarCheck, text: `${onTimePercent}% of this shop's gifts arrived on the chosen day (last 90 days)` }, ...ITEMS];
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 border-t pt-5 text-sm text-foreground-secondary sm:grid-cols-2">
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-2">
          <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold-ink" />
          {text}
        </li>
      ))}
    </ul>
  );
}
