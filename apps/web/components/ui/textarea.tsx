import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/field-styles";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[5.5rem] py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

export { Textarea };
