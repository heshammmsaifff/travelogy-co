/**
 * How a package is priced: per person, on one of four bases.
 *
 * This lives in `domain/` because BOTH sides need it — the repository maps it
 * out of Postgres and the booking dialog renders a counter per value — and
 * §6 puts things that depend on nothing here. It was originally exported from
 * the repository, which is `server-only`, so the client build failed the
 * moment a "use client" component imported it: the same shape as the
 * `buttonVariants` trap in §15 (Phase 4), where a value lived in a module the
 * other side could not import.
 */
export type Occupancy = "single" | "double" | "triple" | "child";

export const OCCUPANCIES: readonly Occupancy[] = ["single", "double", "triple", "child"];
