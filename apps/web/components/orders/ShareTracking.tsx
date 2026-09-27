"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { brand } from "@/lib/brand";

/**
 * Share the public tracking link — e.g. with the family member expecting the gift.
 * The link contains no personal data; the tracking page is the only thing it opens.
 */
export function ShareTracking({ publicToken }: { publicToken: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => setUrl(`${window.location.origin}/track/${publicToken}`), [publicToken]);
  if (!url) return null;

  const text = `Track the gift I sent with ${brand.name}: ${url}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle aria-hidden className="h-3.5 w-3.5" />
        Share on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
      </a>
      <CopyButton value={url} label="tracking link" />
    </div>
  );
}
