import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

/**
 * Button styling, split out from the Button component itself.
 *
 *
 * `button.tsx` is a Client Component (Radix Slot, forwardRef), and a value
 * exported from a "use client" module cannot be CALLED on the server — only
 * rendered as a component or passed as a prop. So a Server Component that
 * wants a link styled as a button could not reach `buttonVariants` at all.
 *
 * Keeping the variants in this plain module lets both sides use them: the
 * client Button imports it, and a Server Component can style a `<Link>` with
 * it directly. That matters because `asChild` — the other way to render a
 * link as a button — routes through Radix Slot, which misbehaves across the
 * RSC boundary in dev (CLAUDE.md §15).
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
        primary: "bg-brand-600 text-ink-inverse hover:bg-brand-700 active:bg-brand-800 shadow-sm",
        gold: "bg-gold-500 text-neutral-950 font-semibold hover:bg-gold-600 active:bg-gold-700 shadow-sm",
        teal: "bg-brand-500 text-ink-inverse hover:bg-brand-600 active:bg-brand-700 shadow-sm",
        secondary:
          "bg-surface text-ink border border-border hover:bg-surface-hover active:bg-neutral-200 shadow-xs",
        outline:
          "border border-border-strong bg-transparent text-ink hover:bg-surface-hover active:bg-neutral-200",
        ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-neutral-200",
        danger: "bg-danger-600 text-ink-inverse hover:bg-danger-700 shadow-sm",
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

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export { buttonVariants };
