import "server-only";

/**
 * Minimal fixed-window rate limiter (CLAUDE.md §12).
 *
 * ── Scope and honest limitations ─────────────────────────────────────────────
 * This is an IN-MEMORY, PER-INSTANCE limiter. On a serverless deployment each
 * instance keeps its own counter, so the effective limit is (limit × instances)
 * and the state is lost on cold start. That is adequate for Phase 0 — it stops
 * a runaway loop or a casual script hammering an endpoint — and is deliberately
 * not presented as a real abuse defence.
 *
 * Phase 10 (hardening) replaces this with a shared store (a Supabase table or
 * an edge KV) so the limit holds across instances. The call signature is chosen
 * to make that swap a drop-in change.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-lived server process. */
function evictExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Records a hit against `key`.
 * @returns `true` if the request is within budget, `false` if it should be rejected.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): boolean {
  const now = Date.now();
  evictExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}
