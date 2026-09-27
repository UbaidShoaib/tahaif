import { Heart } from "lucide-react";
import type { ThanksRead } from "@/lib/cart";

/** The recipient's thank-you, shown to the buyer on the tracking page. */
export function ThanksReceived({ thanks, from }: { thanks: ThanksRead; from: string }) {
  const type = thanks.media_type ?? "";
  return (
    <section aria-label={`Thank-you from ${from}`} className="space-y-3 rounded-lg border border-gold bg-gold-soft/40 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Heart aria-hidden className="h-4 w-4 text-link" /> {from} sent you a thank-you
      </p>
      {thanks.message && (
        <blockquote dir="auto" className="whitespace-pre-wrap text-sm italic">
          “{thanks.message}”
        </blockquote>
      )}
      {thanks.media_url && type.startsWith("image/") && (
        // Signed, short-lived S3 link: not a configured next/image host.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thanks.media_url} alt={`Photo from ${from}`} className="max-h-80 rounded-lg border object-cover" />
      )}
      {thanks.media_url && type.startsWith("video/") && (
        <video controls playsInline preload="metadata" className="w-full rounded-lg border bg-black">
          <source src={thanks.media_url} type={type} />
        </video>
      )}
      {thanks.media_url && type.startsWith("audio/") && (
        <audio controls preload="metadata" className="w-full">
          <source src={thanks.media_url} type={type} />
        </audio>
      )}
    </section>
  );
}
