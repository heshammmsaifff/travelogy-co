import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Status badge.
 *
 * Design skill rule applied here: "colour alone cannot convey badge meaning."
 * Each badge therefore carries a small dot AND a text label — colour is a
 * reinforcement, never the sole signal. That matters for the booking states
 * this will mostly be used for (pending / confirmed / cancelled) where a
 * colour-blind user must still be able to read the state.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-100 text-neutral-700",
        brand: "bg-brand-50 text-brand-700",
        success: "bg-success-50 text-success-700",
        warning: "bg-warning-50 text-warning-700",
        danger: "bg-danger-50 text-danger-700",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const DOT_TONES = {
  neutral: "bg-neutral-500",
  brand: "bg-brand-600",
  success: "bg-success-600",
  warning: "bg-warning-600",
  danger: "bg-danger-600",
} as const;

export type BadgeProps = VariantProps<typeof badgeVariants> & {
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", DOT_TONES[tone ?? "neutral"])}
        aria-hidden
      />
      {children}
    </span>
  );
}
