import { ProofUpload } from "@/components/checkout/ProofUpload";
import { CopyButton } from "@/components/ui/copy-button";
import { brand } from "@/lib/brand";
import { orderNumber } from "@/lib/orders";
import { formatPrice } from "@/lib/utils";

/** Where to send a bank transfer, and the receipt upload. */
export function BankTransferPanel({
  orderId,
  publicToken,
  totalPkr,
  title = "Pay by bank transfer",
}: {
  orderId: string;
  publicToken: string;
  totalPkr: number;
  /** Heading; the confirmation page leads with it as the one next step. */
  title?: string;
}) {
  const bankIban = process.env.NEXT_PUBLIC_BANK_IBAN ?? null;
  const ref = orderNumber(publicToken);
  return (
    <section aria-labelledby="pay-heading" className="mb-6 space-y-4 rounded-xl border border-warning/40 bg-warning-soft p-5">
      <h2 id="pay-heading" className="text-h3">
        {title}
      </h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <dt className="text-foreground-secondary">Amount</dt>
        <dd className="font-semibold">{formatPrice(totalPkr)}</dd>
        <dd className="hidden sm:block" />
        <dt className="text-foreground-secondary">Account</dt>
        <dd className="font-medium">{brand.bankAccountName}</dd>
        <dd className="hidden sm:block" />
        {bankIban && (
          <>
            <dt className="text-foreground-secondary">IBAN</dt>
            <dd className="break-all font-mono">{bankIban}</dd>
            <dd>
              <CopyButton value={bankIban} label="IBAN" />
            </dd>
          </>
        )}
        <dt className="text-foreground-secondary">Reference</dt>
        <dd className="font-mono">{ref}</dd>
        <dd>
          <CopyButton value={ref} label="payment reference" />
        </dd>
      </dl>
      <ProofUpload orderId={orderId} publicToken={publicToken} />
    </section>
  );
}
