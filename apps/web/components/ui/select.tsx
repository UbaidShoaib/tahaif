import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/field-styles";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native <select> styled like Input. Native keeps the OS picker on mobile,
 * which is faster and more accessible than a custom listbox for short lists.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(fieldBase, "h-11 appearance-none py-2 pe-10", className)}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
));
Select.displayName = "Select";

export { Select };
