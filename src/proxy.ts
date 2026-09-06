import createMiddleware from "next-intl/middleware";
import { routing } from "@/shared/i18n/routing";

/**
 * Network-boundary handler.
 *
 * NOTE ON THE FILENAME: CLAUDE.md §6 calls for `src/middleware.ts`. Next.js 16
 * renamed that file to `proxy.ts` (with the export renamed `middleware` ->
 * `proxy`); `middleware.ts` still works but is deprecated and slated for
 * removal. We follow the framework's current name — same role, same position in
 * the architecture.
 *
 * Phase 0 scope: locale negotiation only.
 * Phase 1 adds Supabase session refresh and the `(agent)` / `(admin)` route
 * guards here, wrapping the response this returns.
 */
const handleI18nRouting = createMiddleware(routing);

export function proxy(request: Parameters<typeof handleI18nRouting>[0]) {
  return handleI18nRouting(request);
}

export const config = {
  // Skip API routes, Next internals and anything with a file extension.
  matcher: ["/((?!api|_next|_vercel|.*\..*).*)"],
};
