import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = { title: "Terms of Service", ...canonical("/terms") };

export default function Page() {
  return (
    <div className="container mx-auto max-w-2xl space-y-10 px-4 py-16">
      <div className="space-y-2">
        <h1 className="text-h1">Terms of Service</h1>
        <p className="text-muted-foreground">The full terms are coming soon.</p>
      </div>

      <section id="card-notes" className="scroll-mt-24 space-y-3">
        <h2 className="text-h2">Voice and video notes on cards</h2>
        <p>
          You can add a recorded message to a gift&apos;s card. The recipient plays it by scanning a QR code. You are
          responsible for what you record, and by adding a note you confirm that it:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>is not abusive, threatening, harassing or intended to frighten anyone;</li>
          <li>contains no sexual or indecent content;</li>
          <li>does not attack anyone&apos;s religion, sect, ethnicity or community, or incite hatred or violence;</li>
          <li>is not defamatory and does not share anyone&apos;s private information without permission;</li>
          <li>is your own recording, or one you have the right to send.</li>
        </ul>
        <p>
          {brand.name} does not create, edit or endorse notes. We record when and from where you agreed to these
          rules. Anyone who opens a note can report it. We may remove a note, keep a copy for our records, and share it
          with the authorities where the law requires. Notes stop playing 90 days after delivery.
        </p>
      </section>
    </div>
  );
}
