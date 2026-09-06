"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { cn } from "@/shared/lib/cn";

/**
 * Button primitive.
 *
 * Design rules baked in here rather than left to call sites:
 *  - every interactive element gets `cursor-pointer` (and `cursor-not-allowed`
 *    when disabled)
 *  - focus is always visible, via a ring offset that reads on any surface
 *  - icon spacing uses logical properties, so RTL mirrors without extra classes
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap",
    "transition-colors duration-150 ease-out-soft cursor-pointer select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-ink-inverse hover:bg-brand-700 active:bg-brand-800",
        secondary:
          "bg-surface text-ink border border-border-strong hover:bg-surface-hover active:bg-neutral-200",
        ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-neutral-200",
        danger: "bg-danger-600 text-ink-inverse hover:bg-danger-700",
        link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-base [&_svg]:size-4.5",
        icon: "size-9 p-0 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (e.g. a Link) instead of a <button>. */
    asChild?: boolean;
    /** Shows a spinner and blocks interaction while an action is in flight. */
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  // Slot requires exactly one element child, so the asChild path passes
  // `children` straight through. Loading state is not supported there by
  // design: asChild exists to render links, which don't have in-flight states.
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      // Screen readers get the busy state; sighted users get the spinner.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };
