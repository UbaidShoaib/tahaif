"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Page-level error boundary: keeps the header and footer, offers a retry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server errors are already reported by the instrumentation hooks; this logs client-side ones.
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon={AlertTriangle}
        as="h1"
        title="Something went wrong on our side"
        description={
          <>
            Please try again. Your cart is saved.
            {error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}
          </>
        }
        action={
          <>
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/">Go to the home page</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
