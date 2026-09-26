import { Banknote, Leaf, MapPinned, MessageSquareHeart } from "lucide-react";

// Only claims the service actually makes today. Add refund/replacement promises
// here once the Refund Policy page publishes them (it currently says "Coming soon").
const ITEMS = [
  { icon: Leaf, text: "Freshness promise on cakes and flowers" },
  { icon: MessageSquareHeart, text: "Your message printed on a card with the gift" },
  { icon: Banknote, text: "Cash on delivery or bank transfer" },
  { icon: MapPinned, text: "Track the delivery online" },
];

/** Reassurance next to the buy button. Icons are decorative; the text carries the meaning. */
export function TrustList() {
  return (
    <ul className="grid grid-cols-1 gap-2 text-sm text-foreground-secondary sm:grid-cols-2">
      {ITEMS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-2">
          <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          {text}
        </li>
      ))}
    </ul>
  );
}
