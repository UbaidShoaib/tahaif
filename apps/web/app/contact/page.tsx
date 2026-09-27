import { SupportWhatsApp } from "@/components/support/SupportWhatsApp";
import { support } from "@/lib/support";

export default function Page() {
  return (
    <div className="container mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Contact Us</h1>
      {support.whatsapp ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-muted-foreground">
            Sending a gift from abroad? Message us on WhatsApp and a real person will help.
          </p>
          <SupportWhatsApp />
        </div>
      ) : (
        <p className="text-muted-foreground">Coming soon</p>
      )}
    </div>
  );
}
