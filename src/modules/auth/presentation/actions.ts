"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/server";
import { clientEnv } from "@/shared/lib/env";
import { resolveClientIp } from "@/shared/lib/client-ip";
import { rateLimit, type RateLimitResult } from "@/shared/lib/rate-limit";
import type { Locale } from "@/shared/i18n/config";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/modules/auth/application/schemas";

/**
 * Auth Server Actions.
 *
 * Kept thin per CLAUDE.md §6: validate with the module's Zod schema, call
 * Supabase Auth, map the result. Every action re-validates server-side even
 * though the form already did (§12).
 *
 * All failures return an i18n *key*, never a raw provider message, so errors
 * are bilingual and never leak provider internals to the browser.
 */

export type ActionState =
  | { ok: false; errorKey: string; retryAfterSeconds?: number }
  | { ok: true; messageKey?: string }
  | null;

/**
 * Per-IP rate-limit guard.
 *
 * The caller's address only reaches us through a proxy header. A direct
 * connection — which is every request to `next dev` on localhost — carries
 * none of them, and the previous version collapsed all of those into a single
 * `unknown` bucket. That silently throttled the whole machine to a handful of
 * registrations an hour during development, which is indistinguishable from a
 * real fault and cost time to diagnose.
 *
 * So: when no address can be resolved, fail *open* in development (there is
 * one developer and no attacker) and *closed* in production (a deployment with
 * no forwarding header is misconfigured, and a shared bucket is the safe
 * reading of that).
 */
async function guard(
  prefix: string,
  options: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const ip = resolveClientIp(await headers());

  if (!ip) {
    if (process.env.NODE_ENV !== "production") {
      return { allowed: true, retryAfterSeconds: 0, remaining: options.limit };
    }
    return rateLimit(`${prefix}:no-ip`, options);
  }

  return rateLimit(`${prefix}:${ip}`, options);
}

// ---------------------------------------------------------------- sign in

export async function signInAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // CLAUDE.md §12: login is a sensitive handler and must be rate-limited.
  const signinLimit = await guard("signin", { limit: 10, windowMs: 5 * 60_000 });
  if (!signinLimit.allowed) {
    return {
      ok: false,
      errorKey: "auth.errors.rateLimited",
      retryAfterSeconds: signinLimit.retryAfterSeconds,
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { ok: false, errorKey: "auth.errors.invalidCredentials" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately the same message for "no such account" and "wrong password":
    // distinguishing them turns the login form into an account enumerator.
    return { ok: false, errorKey: "auth.errors.invalidCredentials" };
  }

  // Where to land is decided by the layout that reads the profile, so this
  // redirect only needs to get the user inside the authenticated area.
  redirect(`/${locale}/redirect`);
}

// --------------------------------------------------------------- register

export async function registerAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // 10 an hour rather than 5: a travel agency's branches often share one NAT
  // address, so several genuine sign-ups can arrive from the same IP.
  const registerLimit = await guard("register", { limit: 10, windowMs: 60 * 60_000 });
  if (!registerLimit.allowed) {
    return {
      ok: false,
      errorKey: "auth.errors.rateLimited",
      retryAfterSeconds: registerLimit.retryAfterSeconds,
    };
  }

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    agencyName: formData.get("agencyName"),
    phone: formData.get("phone"),
    countryCode: formData.get("countryCode"),
    city: formData.get("city") ?? "",
    commercialRegNo: formData.get("commercialRegNo") ?? "",
    taxId: formData.get("taxId") ?? "",
    acceptTerms: formData.get("acceptTerms") === "on",
  });

  if (!parsed.success) return { ok: false, errorKey: "auth.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  // The role and status are NOT passed here. The signup trigger always creates
  // an agent_owner in `pending`, precisely because this metadata is
  // client-controlled (see handle_new_user in the migrations).
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/api/auth/confirm?next=/${locale}/pending`,
      data: {
        full_name: d.fullName,
        agency_name: d.agencyName,
        phone: d.phone,
        country_code: d.countryCode,
        city: d.city || null,
        commercial_reg_no: d.commercialRegNo || null,
        tax_id: d.taxId || null,
        preferred_locale: locale,
      },
    },
  });

  if (error) {
    // Supabase returns 429 for two very different situations, and reporting
    // them identically is what made this confusing to diagnose:
    //   over_email_send_rate_limit -> the *email provider* is throttling us,
    //     which the user can do nothing about and retrying will not fix
    //   anything else 429      -> too many requests from this caller
    if (error.code === "over_email_send_rate_limit") {
      console.error(
        "[register] Supabase email send limit reached. The built-in SMTP is capped at a few messages per hour; configure a custom SMTP provider in Authentication > Emails.",
      );
      return { ok: false, errorKey: "auth.errors.emailServiceUnavailable" };
    }
    if (error.status === 429) return { ok: false, errorKey: "auth.errors.rateLimited" };

    // Anything else is unexpected and would otherwise vanish silently — the
    // user only ever sees the generic message, so log the real reason.
    console.error("[register] signUp failed:", error.status, error.code, error.message);

    // Supabase does not reveal whether an email already exists, and neither do
    // we — the success screen is shown either way.
    return { ok: false, errorKey: "auth.errors.registrationFailed" };
  }

  // Supabase returns a session only when email confirmation is switched off.
  // Sending the user to a screen that says "check your email" in that case
  // would be telling them to wait for a message that will never arrive, so
  // route them straight to the awaiting-approval screen instead.
  if (data.session) {
    redirect(`/${locale}/pending`);
  }

  redirect(`/${locale}/register/submitted`);
}

// -------------------------------------------------------- password reset

export async function requestPasswordResetAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const resetLimit = await guard("pwreset", { limit: 5, windowMs: 15 * 60_000 });
  if (!resetLimit.allowed) {
    return {
      ok: false,
      errorKey: "auth.errors.rateLimited",
      retryAfterSeconds: resetLimit.retryAfterSeconds,
    };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  // Even a malformed address gets the neutral confirmation below, so the form
  // cannot be used to test which addresses exist.
  if (parsed.success) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/api/auth/confirm?next=/${locale}/reset-password`,
    });

    // A 429 says nothing about whether the address exists — it is our own
    // capacity, identical for every caller — so reporting it leaks nothing
    // while telling the user the truth. Claiming "check your inbox" when the
    // provider refused to send is the screen that lies about its own state
    // (CLAUDE.md §2.3), and it is what made a dead reset flow look like a
    // mail-delivery problem on the user's side.
    if (error?.code === "over_email_send_rate_limit") {
      console.error(
        "[pwreset] Supabase email send limit reached. The built-in SMTP is capped at a few messages per hour; configure a custom SMTP provider in Authentication > Emails.",
      );
      return { ok: false, errorKey: "auth.errors.emailServiceUnavailable" };
    }
    if (error?.status === 429) {
      return { ok: false, errorKey: "auth.errors.rateLimited" };
    }

    // Any other failure stays neutral: unlike a 429, it could differ between a
    // real and an unknown address, so surfacing it would enumerate accounts.
    if (error) {
      console.error("[pwreset] resetPasswordForEmail failed:", error.status, error.code, error.message);
    }
  }

  return { ok: true, messageKey: "auth.forgotPassword.sent" };
}

export async function updatePasswordAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return { ok: false, errorKey: "auth.errors.invalidInput" };

  const supabase = await createClient();

  // The recovery link established a session before this page loaded; without
  // one there is nothing to update, and we must not silently appear to succeed.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errorKey: "auth.errors.resetLinkExpired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, errorKey: "auth.errors.passwordUpdateFailed" };

  redirect(`/${locale}/login?reset=1`);
}

/**
 * Clears a forced temporary password.
 *
 * Distinct from updatePasswordAction, which serves the email-recovery flow:
 * this one also clears `must_change_password`, which is what releases the user
 * from the change-password screen.
 */
export async function changePasswordAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, errorKey: "auth.errors.invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errorKey: "auth.errors.sessionExpired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, errorKey: "auth.errors.passwordUpdateFailed" };

  // The flag is NOT cleared here. The database refuses that from any signed-in
  // user — letting the account holder clear it was a way to skip the change
  // entirely — and a trigger on auth.users clears it the moment the password
  // hash actually changes. Read it back so a missing trigger fails loudly
  // instead of redirecting the user straight back to this screen.
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .single();

  if (readError || !profile || profile.must_change_password) {
    console.error(
      "[auth] password changed but must_change_password is still set:",
      readError?.message ?? "flag not cleared by trigger",
    );
    return { ok: false, errorKey: "auth.errors.passwordUpdateFailed" };
  }

  redirect(`/${locale}/redirect`);
}

// --------------------------------------------------------------- sign out

export async function signOutAction(locale: Locale): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
