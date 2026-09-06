"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { LuCircleAlert } from "react-icons/lu";
import { cn } from "@/shared/lib/cn";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  /** Helper text shown under the field while it is valid. */
  hint?: ReactNode;
  /** Validation message. Its presence puts the field into the error state. */
  error?: string;
  /** Icon rendered at the leading edge (start, so it mirrors under RTL). */
  leadingIcon?: ReactNode;
};

/**
 * Text input with label, hint and error state.
 *
 * Wiring notes:
 *  - `aria-describedby` points at whichever of hint/error is currently shown,
 *    so the message is announced rather than merely displayed
 *  - `aria-invalid` drives both the styling and the assistive-tech state, so
 *    the two can never disagree
 *  - forwardRef is what lets React Hook Form's `register()` attach directly
 *  - padding uses logical properties (ps-/pe-) so the leading icon sits on the
 *    correct side in both ar and en
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, leadingIcon, id, disabled, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ms-0.5 text-danger-600" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className="relative">
        {leadingIcon ? (
          <span
            className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-subtle [&_svg]:size-4"
            aria-hidden
          >
            {leadingIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : hint ? hintId : undefined}
          className={cn(
            "h-9 w-full rounded-control border bg-surface px-3 text-sm text-ink",
            "placeholder:text-ink-subtle",
            "transition-colors duration-150 ease-out-soft",
            "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
            "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
            leadingIcon && "ps-9",
            hasError
              ? "border-danger-600 focus-visible:outline-danger-600"
              : "border-border-strong hover:border-neutral-400",
            className,
          )}
          {...props}
        />
      </div>

      {hasError ? (
        <p id={errorId} className="flex items-center gap-1.5 text-xs text-danger-700" role="alert">
          <LuCircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
