import Image from "next/image";
import { Gift } from "lucide-react";
import { isOptimizable } from "@/lib/image-hosts";

export function PieceImage({ src, sizes }: { src: string | null; sizes: string }) {
  return src ? (
    <Image src={src} alt="" fill sizes={sizes} className="object-cover" unoptimized={!isOptimizable(src)} />
  ) : (
    <Gift aria-hidden className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />
  );
}
