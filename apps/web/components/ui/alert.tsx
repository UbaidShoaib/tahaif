import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:ps-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground [&>svg]:text-foreground",
        destructive: "border-destructive/40 bg-destructive-soft text-destructive [&>svg]:text-destructive",
        success: "border-success/40 bg-success-soft text-success-foreground [&>svg]:text-success-foreground",
        warning: "border-warning/40 bg-warning-soft text-warning [&>svg]:text-warning",
        info: "border-info/40 bg-info-soft text-info [&>svg]:text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type AlertProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

/**
 * Inline message. Errors (default/destructive) interrupt with role="alert";
 * success/warning/info are polite status messages. Pass `role` to override.
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ className, variant, role, ...props }, ref) => {
  const polite = variant === "success" || variant === "warning" || variant === "info";
  return (
    <div
      ref={ref}
      role={role ?? (polite ? "status" : "alert")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
});
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("mb-1 font-semibold leading-none", className)} {...props} />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
