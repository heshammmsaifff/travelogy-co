import "server-only";

/**
 * Extracts a searchable message from whatever a database call rejected with.
 *
 * Supabase returns a plain `PostgrestError` object — `{ message, details, hint,
 * code }` — not an `Error` instance. Code that tested `error instanceof Error`
 * and otherwise fell back to `String(error)` therefore matched against
 * "[object Object]", so every constraint name lookup silently failed and every
 * refusal surfaced as the generic fallback message. The overlapping-rate
 * message in particular never reached the user, which is the one case where
 * knowing *why* actually matters.
 *
 * `details` is included because Postgres puts the offending values there, and
 * for an exclusion constraint that is what names the conflicting row.
 */
export function describeDbError(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [e.message, e.details, e.hint, e.code]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" | ");
  }

  return String(error);
}
