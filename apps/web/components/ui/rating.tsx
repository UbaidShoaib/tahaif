"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-6 w-6" } as const;

/** Read-only star rating, announced as one image: "4 out of 5 stars". */
export function Rating({
  value,
  max = 5,
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // Round to the nearest half so 4.5 shows four and a half stars, not five.
  const halves = Math.round(value * 2) / 2;
  return (
    <span role="img" aria-label={`${value} out of ${max} stars`} className={cn("inline-flex gap-0.5", className)}>
      {Array.from({ length: max }, (_, i) => {
        const fill = halves >= i + 1 ? "full" : halves >= i + 0.5 ? "half" : "empty";
        return (
          <span key={i} aria-hidden data-fill={fill} className="relative inline-flex">
            <Star className={cn(SIZES[size], "text-star", fill === "full" ? "fill-current" : "fill-transparent")} />
            {fill === "half" && (
              <span className="absolute inset-y-0 start-0 w-1/2 overflow-hidden">
                <Star className={cn(SIZES[size], "fill-current text-star")} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Star rating input: a fieldset of 5 native radios, so arrow keys and screen
 * readers work ("3 stars, radio, 3 of 5").
 */
export function RatingInput({
  value,
  onChange,
  legend = "Rating",
  max = 5,
  name,
}: {
  value: number;
  onChange: (value: number) => void;
  legend?: string;
  max?: number;
  name?: string;
}) {
  const generated = React.useId();
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1;
          return (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name={name ?? generated}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
              <Star
                aria-hidden
                className={cn("h-7 w-7 text-star", n <= shown ? "fill-current" : "fill-transparent")}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
