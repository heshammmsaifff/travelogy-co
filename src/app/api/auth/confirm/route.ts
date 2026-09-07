import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/shared/lib/supabase/server";
import { routing } from "@/shared/i18n/routing";

/**
 * Landing point for every email link: confirmation, recovery, invite.
 *
 * Supabase can deliver a verified link in more than one shape, and which one
 * arrives depends on the email template rather than on anything in this repo:
 *
 *  - `?code=…`                  the PKCE flow. Supabase's default template
 *                               (`{{ .ConfirmationURL }}`) sends the user to
 *                               its own `/auth/v1/verify`, which consumes the
 *                               token and redirects here with a one-time code.
 *                               This is what our own flows produce today,
 *                               because `@supabase/ssr` requests PKCE.
 *  - `?token_hash=…&type=…`     the stateless flow, produced by a template
 *                               built on `{{ .TokenHash }}`. Preferred, since
 *                               it needs no cookie from the requesting browser
 *                               and therefore survives the user opening the
 *                               email on a different device.
 *  - `?error=…&error_code=…`    Supabase rejected the token before we saw it.
 *
 * Handling only `token_hash` was the original defect: a perfectly valid
 * recovery link arrived as `?code=` and was answered with "invalid link".
 *
 * Not handled, deliberately: the implicit flow's `#access_token=…`. A fragment
 * never reaches the server, so a Route Handler cannot see it at all. Nothing in
 * this app issues implicit links — only an admin-generated one would be — so
 * rather than shipping a client-side token reader as a second auth surface,
 * that shape falls through to the error page.
 */

const VALID_TYPES: readonly EmailOtpType[] = [
  "signup",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
];

/** Only ever redirect to a path on this site, never to a supplied host. */
function safeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return `/${routing.defaultLocale}`;
  }
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const locale = next.split("/").filter(Boolean)[0] ?? routing.defaultLocale;

  const { supabase, applyCookies } = createRouteHandlerClient(request);

  const fail = (reason: "invalid" | "expired" | "wrongBrowser") =>
    NextResponse.redirect(`${origin}/${locale}/auth-error?reason=${reason}`);

  // Cookies are applied to the success redirect explicitly: the session must
  // land on the same response that sends the user to the next page.
  const succeed = () => applyCookies(NextResponse.redirect(`${origin}${next}`));

  // 1. Supabase already refused the token.
  const errorCode = searchParams.get("error_code");
  if (searchParams.get("error") || errorCode) {
    console.error(
      "[auth/confirm] provider rejected the link:",
      errorCode ?? searchParams.get("error"),
    );
    return fail(errorCode === "otp_expired" ? "expired" : "invalid");
  }

  // 2. PKCE: exchange the one-time code for a session.
  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/confirm] code exchange failed:", error.message);
      // A verifier that is missing or belongs to a different request means the
      // link was opened somewhere other than where it was asked for — inherent
      // to PKCE. Saying "expired" there would be untrue and would send the user
      // to request another link that fails the same way, so it gets its own
      // message. This is the case the `{{ .TokenHash }}` template avoids.
      const noVerifier = /code[ _]verifier|code challenge/i.test(error.message);
      return fail(noVerifier ? "wrongBrowser" : "expired");
    }
    return succeed();
  }

  // 3. Stateless: verify the hashed token directly.
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && VALID_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("[auth/confirm] verifyOtp failed:", error.message);
      return fail("expired");
    }
    return succeed();
  }

  return fail("invalid");
}
