"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Slide-over panel built on Radix Dialog: focus trap, Escape to close, focus
 * restore, inert background and aria-modal are all handled by Radix.
 * `start`/`end` are logical sides, so they flip correctly in RTL.
 */
const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;

const sheetVariants = cva(
  "fixed z-50 flex flex-col bg-background shadow-lg outline-none " +
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200",
  {
    variants: {
      side: {
        end: "inset-y-0 end-0 h-full w-full max-w-sm border-s data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right rtl:data-[state=open]:slide-in-from-left rtl:data-[state=closed]:slide-out-to-left",
        start: "inset-y-0 start-0 h-full w-[85vw] max-w-xs border-e data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left rtl:data-[state=open]:slide-in-from-right rtl:data-[state=closed]:slide-out-to-right",
        bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    },
    defaultVariants: { side: "end" },
  },
);

type ContentProps = React.ComponentPropsWithoutRef<typeof Dialog.Content> &
  VariantProps<typeof sheetVariants> & {
    /** Required for screen readers; hide it visually with `hideTitle` if the design has none. */
    title: React.ReactNode;
    description?: React.ReactNode;
    hideTitle?: boolean;
    /** Accessible name of the close button. */
    closeLabel?: string;
    /** Extra content in the header row, next to the title (e.g. an item-count badge). */
    headerExtra?: React.ReactNode;
  };

const SheetContent = React.forwardRef<React.ElementRef<typeof Dialog.Content>, ContentProps>(
  ({ side, className, children, title, description, hideTitle, closeLabel = "Close", headerExtra, ...props }, ref) => (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <Dialog.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className={cn("flex items-center justify-between gap-2 border-b px-4 py-2", hideTitle && "sr-only")}>
          <div className="flex min-w-0 items-center gap-2">
            <Dialog.Title className="font-sans text-lg font-semibold">{title}</Dialog.Title>
            {headerExtra}
          </div>
          <Dialog.Close
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={closeLabel}
          >
            <X aria-hidden className="h-5 w-5" />
          </Dialog.Close>
        </div>
        {description && (
          <Dialog.Description className="px-4 pt-2 text-sm text-muted-foreground">{description}</Dialog.Description>
        )}
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  ),
);
SheetContent.displayName = "SheetContent";

export { Sheet, SheetTrigger, SheetClose, SheetContent };
