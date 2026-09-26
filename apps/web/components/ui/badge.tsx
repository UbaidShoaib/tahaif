import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        brand: "bg-primary-soft text-primary-soft-foreground",
        gold: "bg-gold-soft text-gold-ink",
        success: "bg-success-soft text-success-foreground",
        warning: "bg-warning-soft text-warning",
        error: "bg-destructive-soft text-destructive",
        info: "bg-info-soft text-info",
        solid: "bg-primary-700 text-white",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

/**
 * Short status or label text. Meaning must be carried by the text (and an
 * optional icon, passed as a child) — never by the color alone.
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
