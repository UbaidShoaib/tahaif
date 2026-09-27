import { Gift } from "lucide-react";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Size classes for the mark (icon or image), e.g. "h-6 w-6". */
  markClassName?: string;
  /** Show the optional second-script name (header only). */
  showLocalName?: boolean;
}

/** The configurable brand mark + wordmark. Wrap it in a link at the call site. */
export function BrandLogo({ markClassName = "h-6 w-6", showLocalName = false }: BrandLogoProps) {
  return (
    <>
      {brand.logoUrl ? (
        // A plain <img>: the logo host is deployment-specific and may not be in next.config images.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" aria-hidden className={cn("object-contain", markClassName)} />
      ) : (
        <Gift aria-hidden className={markClassName} />
      )}
      <span>
        {showLocalName && brand.localName ? <span className="hidden xs:inline">{brand.localName} </span> : null}
        {brand.name}
      </span>
    </>
  );
}
