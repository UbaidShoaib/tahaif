import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Usually one primary Button (asChild Link) and optionally a secondary one. */
  action?: React.ReactNode;
  /** Heading level; defaults to h2 so it fits under a page h1. */
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, as: Heading = "h2", className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-4 py-16 text-center", className)}>
      {Icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
          <Icon aria-hidden className="h-8 w-8 text-primary-soft-foreground" />
        </div>
      )}
      <Heading className="text-h3 font-sans font-semibold">{title}</Heading>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
