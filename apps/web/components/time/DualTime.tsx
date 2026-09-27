"use client";

import { useEffect, useState } from "react";
import { PAKISTAN_TZ, formatDateTime, viewerSuffix, viewerTimeZone, zoneLabel } from "@/lib/datetime";

type Props = {
  /** ISO instant, e.g. a fulfillment's delivered_at. */
  iso: string;
  /** The delivery city's IANA zone. */
  cityTz?: string | null;
};

/**
 * "28 Sep, 2:30 pm PKT (10:30 am your time)".
 *
 * The city time renders on the server; the buyer's time is added after mount,
 * since the viewer's zone is only known in the browser (no hydration mismatch).
 */
export function DualTime({ iso, cityTz }: Props) {
  const zone = cityTz || PAKISTAN_TZ;
  const at = new Date(iso);
  const [suffix, setSuffix] = useState<string | null>(null);

  useEffect(() => {
    setSuffix(viewerSuffix(new Date(iso), zone, viewerTimeZone()));
  }, [iso, zone]);

  return (
    <time dateTime={iso}>
      {formatDateTime(at, zone)} {zoneLabel(zone, at)}
      {suffix && <span className="text-muted-foreground"> ({suffix})</span>}
    </time>
  );
}
