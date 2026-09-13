import "server-only";

/**
 * Minimal fixed-window rate limiter (CLAUDE.md §12).
 *
 * ── Scope and honest limitations ─────────────────────────────────────────────
 * This is an IN-MEMORY, PER-INSTANCE limiter. On a serverless deployment each
 * instance keeps its own counter, so the effective limit is (limit × instances)
 * and the state is lost on cold start. That is adequate for now — it stops a
 * runaway loop or a casual script hammering an endpoint — and is deliberately
 * not presented as a real abuse defence.
 *
 * Phase 11 (hardening) replaces this with a shared store (a Supabase table or
 * an edge KV) so the limit holds across instances. The call signature is chosen
 * to make that swap a drop-in change.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets. 0 when the request was allowed. */
  retryAfterSeconds: number;
  /**
   * Requests left in the current window after this one. Reported to B2B API
   * clients in `X-RateLimit-Remaining`, so it has to be the real count — a
   * client pacing itself on a wrong number is throttled with no warning.
   */
  remaining: number;
};

/** Stops the map growing without bound on a long-lived server process. */
function evictExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Records a hit against `key`.
 *
 * Returns the wait time as well as the verdict, so the caller can tell the user
 * *when* to try again. "Too many attempts" with no horizon is a dead end —
 * the person has no way to know whether to wait ten seconds or an hour.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  evictExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - 1) };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - bucket.count) };
}
