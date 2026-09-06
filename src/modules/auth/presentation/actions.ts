"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/server";
import { clientEnv } from "@/shared/lib/env";
import { rateLimit } from "@/shared/lib/rate-limit";
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
  { ok: false; errorKey: string } | { ok: true; messageKey?: string } | null;

/**
 * Rate-limit key. Falls back to a shared bucket when no IP header is present,
 * which is stricter rather than laxer — the safe direction for a failure.
 */
async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${prefix}:${ip}`;
}

// ---------------------------------------------------------------- sign in

export async function signInAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // CLAUDE.md §12: login is a sensitive handler and must be rate-limited.
  if (!rateLimit(await clientKey("signin"), { limit: 10, windowMs: 5 * 60_000 })) {
    return { ok: false, errorKey: "auth.errors.rateLimited" };
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
  if (!rateLimit(await clientKey("register"), { limit: 5, windowMs: 60 * 60_000 })) {
    return { ok: false, errorKey: "auth.errors.rateLimited" };
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
  const { error } = await supabase.auth.signUp({
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
    if (error.status === 429) return { ok: false, errorKey: "auth.errors.rateLimited" };
    // Supabase does not reveal whether an email already exists, and neither do
    // we — the success screen is shown either way.
    return { ok: false, errorKey: "auth.errors.registrationFailed" };
  }

  redirect(`/${locale}/register/submitted`);
}

// -------------------------------------------------------- password reset

export async function requestPasswordResetAction(
  locale: Locale,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!rateLimit(await clientKey("pwreset"), { limit: 5, windowMs: 15 * 60_000 })) {
    return { ok: false, errorKey: "auth.errors.rateLimited" };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  // Even a malformed address gets the neutral confirmation below, so the form
  // cannot be used to test which addresses exist.
  if (parsed.success) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/api/auth/confirm?next=/${locale}/reset-password`,
    });
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

  // Clearing the flag grants nothing, so the profile guard permits the user to
  // update it on their own row.
  const { error: flagError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (flagError) return { ok: false, errorKey: "auth.errors.passwordUpdateFailed" };

  redirect(`/${locale}/redirect`);
}

// --------------------------------------------------------------- sign out

export async function signOutAction(locale: Locale): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
