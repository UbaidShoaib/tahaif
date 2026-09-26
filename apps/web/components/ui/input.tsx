import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/field-styles";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      fieldBase,
      "flex h-11 py-2 file:border-0 file:bg-transparent file:text-sm file:font-medium",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
