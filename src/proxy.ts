import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/shared/lib/env";
import { routing } from "@/shared/i18n/routing";

/**
 * Network-boundary handler: locale negotiation, Supabase session refresh, and
 * coarse auth guards.
 *
 * NOTE ON THE FILENAME: CLAUDE.md §6 calls for `src/middleware.ts`. Next.js 16
 * renamed that file to `proxy.ts` (export `middleware` -> `proxy`);
 * `middleware.ts` still works but is deprecated. Same role, same position.
 *
 * ── Division of responsibility (CLAUDE.md §11) ──────────────────────────────
 * This file answers only "is there a session?", which it can do from cookies
 * with no database round trip. It deliberately does NOT check role or account
 * status: that would mean a query on every navigation, including static asset
 * routes. The `(agent)` and `(admin)` layouts do the precise check, using the
 * profile they already have to load in order to render.
 *
 * So: the proxy stops anonymous traffic at the door; the layouts decide which
 * room you belong in. Neither is a substitute for RLS, which is the real
 * enforcement boundary (§12).
 */

const handleI18nRouting = createMiddleware(routing);

/** Path segments (after the locale prefix) reachable without a session. */
const PUBLIC_SEGMENTS = [
  "", // the marketing home page
  "about",
  "privacy",
  "terms",
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "auth-error",
  "ui-kit",
];

/** Signed-in users are bounced away from these — they have already logged in. */
const GUEST_ONLY_SEGMENTS = ["login", "register", "forgot-password"];

// `pending`, `redirect` and `reset-password` need a session but NOT an active
// account — a pending user must be able to reach the waiting screen. They are
// therefore not listed above: the session check below is all they require, and
// the layouts apply the status rules.

function segmentAfterLocale(pathname: string): string {
  // "/ar/login/foo" -> "login"; "/ar" -> ""
  const parts = pathname.split("/").filter(Boolean);
  return parts.length <= 1 ? "" : (parts[1] ?? "");
}

export async function proxy(request: NextRequest) {
  // Locale negotiation first: everything downstream reasons about a path that
  // already carries its locale prefix.
  const response = handleI18nRouting(request);

  // A redirect or rewrite from next-intl is returned as-is; the request will
  // come back around with the resolved locale.
  if (response.headers.get("location")) return response;

  // Refresh the Supabase session and write any rotated cookies onto the
  // response we are about to return. Without this the access token silently
  // expires and Server Components start seeing a signed-out user.
  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const locale = pathname.split("/").filter(Boolean)[0] ?? routing.defaultLocale;
  const segment = segmentAfterLocale(pathname);

  const isPublic = PUBLIC_SEGMENTS.includes(segment);
  const isGuestOnly = GUEST_ONLY_SEGMENTS.includes(segment);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    // Remember where they were headed so login can return them there.
    // Only a path is carried, never a full URL, so this cannot be turned into
    // an open redirect to another host.
    if (pathname !== `/${locale}`) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isGuestOnly) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/redirect`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip API routes, Next internals and anything with a file extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
