import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Table shell.
 *
 * This is the wrapper and the cell primitives, not a data-grid — sorting,
 * pagination and filtering are pushed into Postgres per CLAUDE.md §11, so each
 * module composes this with its own server-driven query rather than doing the
 * work client-side.
 *
 * Server Component by design: a table of rows should not cost client JS.
 *
 * RTL: cells default to `text-start`, so columns align to the reading edge in
 * both directions. Numeric columns should pass `numeric` — figures stay on the
 * trailing edge and use tabular figures so digits line up column-wise.
 */

export function TableShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      {/* The wrapper owns horizontal scrolling so a wide table never forces the
          whole page to scroll sideways. */}
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-sunken">
      <tr className="border-b border-border">{children}</tr>
    </thead>
  );
}

export function TableHeaderCell({
  className,
  numeric = false,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-xs font-semibold tracking-wide text-ink-muted uppercase",
        numeric ? "text-end" : "text-start",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-hover", className)} {...props} />;
}

export function TableCell({
  className,
  numeric = false,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-ink",
        numeric ? "text-end tabular-nums" : "text-start",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** Full-width empty state, spanning every column. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}
