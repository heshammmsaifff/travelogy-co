import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Card surface and its slots.
 *
 * Deliberately a Server Component (no "use client"): a card is pure layout, so
 * keeping it server-side means using one does not pull a page into the client
 * bundle (CLAUDE.md §11).
 */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or controls pinned to the trailing edge of the header. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {/* min-w-0 lets long Arabic titles wrap instead of forcing the row wide. */}
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
