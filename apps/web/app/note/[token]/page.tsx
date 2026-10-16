import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardPreview } from "@/components/greeting/CardPreview";
import { ReportNote } from "@/components/greeting/ReportNote";
import { brand } from "@/lib/brand";
import { notesApi } from "@/lib/notes";

// The recording link is signed per request; never cache or index this page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "A message for you",
  robots: { index: false, follow: false },
};

/**
 * What the recipient opens by scanning the QR code on the greeting card: the
 * sender's recorded voice or video, with the card message. The token only
 * unlocks this note, never the order.
 */
export default async function NotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const note = await notesApi.get(token).catch(() => null);
  if (!note) notFound();

  const isVideo = note.content_type.startsWith("video/");

  return (
    <div className="container mx-auto max-w-lg space-y-6 px-4 py-10 text-center">
      <div className="space-y-1">
        <h1 className="text-h1">A message for you</h1>
        <p className="text-sm text-muted-foreground">Sent with your {note.product_name} through {brand.name}</p>
      </div>

      {isVideo ? (
        <video controls playsInline preload="metadata" className="w-full rounded-xl border bg-black">
          <source src={note.media_url} type={note.content_type} />
          Your browser can&apos;t play this video.
        </video>
      ) : (
        <audio controls preload="metadata" className="w-full">
          <source src={note.media_url} type={note.content_type} />
          Your browser can&apos;t play this recording.
        </audio>
      )}

      {note.greeting_message && <CardPreview message={note.greeting_message} />}

      <ReportNote noteToken={token} />
    </div>
  );
}
