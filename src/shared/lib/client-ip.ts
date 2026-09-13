/**
 * The caller's IP address, as reported by the proxy in front of the app.
 *
 * A direct connection — every request to `next dev` on localhost — carries
 * none of these headers, so this returns `null` rather than a made-up
 * placeholder. Callers must decide what "unknown" means for them: a rate
 * limiter may fail open in development, but an IP allow-list must fail
 * closed, because "no address" is not an address on the list.
 *
 * No `server-only` import: it reads a plain `Headers`-like object, so it can
 * be unit-tested directly.
 */
export function resolveClientIp(headers: Pick<Headers, "get">): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    null
  );
}
