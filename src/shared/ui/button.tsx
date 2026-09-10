"use client";

import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import { forwardRef, isValidElement, cloneElement, type ButtonHTMLAttributes } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "@/shared/ui/button-variants";

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
    if (isValidElement(children)) {
      const childProps = (children as React.ReactElement<{ className?: string }>).props;
      return cloneElement(children as React.ReactElement<any>, {
        ref,
        ...props,
        className: cn(buttonVariants({ variant, size }), className, childProps?.className),
      });
    }
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

// buttonVariants is deliberately NOT re-exported here. Re-exporting it from a
// "use client" module hands server callers a client reference they cannot call,
// which fails with a confusing error. Import it from ./button-variants.
