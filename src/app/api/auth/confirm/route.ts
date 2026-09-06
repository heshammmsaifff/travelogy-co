import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { routing } from "@/shared/i18n/routing";

/**
 * Handles the link Supabase emails out: signup confirmation, password
 * recovery, and email-change confirmation.
 *
 * Thin per CLAUDE.md §6 — verify the one-time token, then redirect.
 */

const VALID_TYPES: readonly EmailOtpType[] = [
  "signup",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
];

/**
 * Only same-origin paths are accepted as a redirect target. Taking the raw
 * `next` value would turn this route into an open redirect: an attacker could
 * mail a genuine-looking confirmation link that lands the user on their site.
 */
function safeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return `/${routing.defaultLocale}`;
  }
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"));
  const locale = next.split("/").filter(Boolean)[0] ?? routing.defaultLocale;

  if (!tokenHash || !type || !VALID_TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/${locale}/auth-error?reason=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Almost always an expired or already-used link. Say that, rather than
    // echoing the provider's wording.
    return NextResponse.redirect(`${origin}/${locale}/auth-error?reason=expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
