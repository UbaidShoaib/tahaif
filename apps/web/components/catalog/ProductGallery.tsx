"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { isOptimizable } from "@/lib/image-hosts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductImage } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const FALLBACK = "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800";

/**
 * Product images: a main image with previous/next buttons, swipeable on
 * phones (horizontal scroll-snap), and a row of thumbnail buttons.
 * Arrow keys move between images when the gallery has focus.
 */
export function ProductGallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  const sorted = [...images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  const slides = sorted.length > 0 ? sorted : [{ id: "fallback", url: FALLBACK, alt_text: null, sort_order: 0, is_primary: true }];
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const count = slides.length;

  const go = (i: number) => {
    const next = (i + count) % count;
    setIndex(next);
    const track = trackRef.current;
    const slide = track?.children[next] as HTMLElement | undefined;
    if (track && slide) track.scrollTo?.({ left: slide.offsetLeft, behavior: "smooth" });
  };

  // Keep the index in sync when the buyer swipes.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index && i >= 0 && i < count) setIndex(i);
  };

  const alt = (img: (typeof slides)[number], i: number) =>
    img.alt_text ?? (count > 1 ? `${productName}, image ${i + 1} of ${count}` : productName);

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`${productName} images`}
      className="space-y-3"
      onKeyDown={(e) => {
        if (count < 2) return;
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex aspect-square snap-x lg:aspect-[4/5] snap-mandatory overflow-x-auto overflow-y-hidden rounded-2xl bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((img, i) => (
            <div
              key={img.id}
              className="relative h-full w-full shrink-0 snap-center"
              aria-hidden={i !== index}
            >
              <Image
                src={img.url}
                alt={alt(img, i)}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority={i === 0}
                unoptimized={!isOptimizable(img.url)}
              />
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous image"
              className="absolute start-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
            >
              <ChevronLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next image"
              className="absolute end-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
            >
              <ChevronRight aria-hidden className="h-5 w-5 rtl:rotate-180" />
            </button>
            <p aria-live="polite" className="absolute bottom-3 end-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium tabular-nums">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slides.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show image ${i + 1} of ${count}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                i === index ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" unoptimized={!isOptimizable(img.url)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
