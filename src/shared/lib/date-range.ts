/**
 * Postgres `daterange` <-> the dates a human types.
 *
 * Contracts are written with a first and a LAST day; the database stores
 * `[from, to+1)` so consecutive seasons meet exactly rather than colliding on
 * the shared day or leaving it unpriced (CLAUDE.md §15, decision 6.3).
 *
 * Shared because hotel rates, hotel offers and transfer rates all follow the
 * same rule, and three copies of an off-by-one conversion is three chances to
 * get it wrong in only one of them.
 */

/** `2026-06-01` + inclusive `2026-06-30` -> `[2026-06-01,2026-07-01)`. */
export function toHalfOpenRange(from: string, toInclusive: string): string {
  const end = new Date(`${toInclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return `[${from},${end.toISOString().slice(0, 10)})`;
}

/** `[2026-06-01,2026-07-01)` -> `{ from: "2026-06-01", to: "2026-06-30" }`. */
export function parseDateRange(raw: string): { from: string; to: string } {
  const match = /^\[?([\d-]+),([\d-]+)\)?$/.exec(raw ?? "");
  if (!match?.[1] || !match[2]) return { from: "", to: "" };

  const upper = new Date(`${match[2]}T00:00:00Z`);
  upper.setUTCDate(upper.getUTCDate() - 1);
  return { from: match[1], to: upper.toISOString().slice(0, 10) };
}
