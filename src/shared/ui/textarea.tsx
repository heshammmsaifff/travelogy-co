import * as React from "react";
import { cn } from "@/shared/lib/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <label htmlFor={textareaId} className="text-sm font-medium text-ink">
            {label}
            {required ? (
              <span className="ms-0.5 text-danger-600" aria-hidden>
                *
              </span>
            ) : null}
          </label>
        ) : null}

        <textarea
          id={textareaId}
          className={cn(
            "flex min-h-[80px] w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink ring-offset-background",
            "placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:border-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-xs",
            error && "border-danger-600 focus-visible:ring-danger-600",
            className,
          )}
          ref={ref}
          {...props}
        />

        {error ? (
          <p className="text-xs text-danger-600">{error}</p>
        ) : hint ? (
          <p className="text-xs text-ink-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
