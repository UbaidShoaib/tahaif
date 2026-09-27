import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThanksForm } from "@/components/thanks/ThanksForm";
import { thanksApi } from "@/lib/thanks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Say thank you",
  robots: { index: false, follow: false },
};

/**
 * The recipient's page (from the card's QR or their WhatsApp message): thank the
 * sender, who is usually abroad, with words, a photo, a voice note or a video.
 */
export default async function ThanksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await thanksApi.get(token).catch(() => null);
  if (!data) notFound();

  const sender = data.gift_from || "the sender";

  return (
    <div className="container mx-auto max-w-lg space-y-6 px-4 py-10 text-center">
      <div className="space-y-1">
        <h1 className="text-h1">Say thank you to {sender}</h1>
        <p className="text-sm text-muted-foreground">
          Assalam-o-Alaikum {data.recipient_name}! You received {data.items.join(" and ")}.
        </p>
      </div>
      <ThanksForm token={token} sender={sender} alreadySent={data.already_sent} />
    </div>
  );
}
