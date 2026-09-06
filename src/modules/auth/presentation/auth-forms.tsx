"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { LuCircleAlert, LuCircleCheck, LuLock, LuMail, LuUser } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  requestPasswordResetAction,
  signInAction,
  registerAction,
  updatePasswordAction,
  type ActionState,
} from "./actions";

/**
 * Auth forms.
 *
 * These use `useActionState` against the Server Actions rather than React Hook
 * Form. The reason is progressive enhancement: a plain <form action={...}>
 * submits and works before any JavaScript has loaded, which matters most on
 * exactly these screens. Validation still runs through the same Zod schema —
 * on the server, where §12 requires it either way.
 *
 * Richer forms later in the product (hotel contracting, booking) do use React
 * Hook Form + Zod on the client, as §3 specifies; those are long, interactive
 * forms where live field-level feedback earns its complexity. A four-field
 * login box does not.
 */

function FormMessage({ state }: { state: ActionState }) {
  const t = useTranslations();
  if (!state) return null;

  if (state.ok) {
    if (!state.messageKey) return null;
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-control bg-success-50 px-3 py-2 text-sm text-success-700"
      >
        <LuCircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t(state.messageKey)}
      </p>
    );
  }

  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {t(state.errorKey)}
    </p>
  );
}

// ------------------------------------------------------------------- sign in

export function LoginForm({ locale }: { locale: Locale }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signInAction.bind(null, locale), null);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />

      <Input
        name="email"
        type="email"
        autoComplete="email"
        required
        dir="ltr"
        label={t("fields.email")}
        leadingIcon={<LuMail />}
      />
      <Input
        name="password"
        type="password"
        autoComplete="current-password"
        required
        label={t("fields.password")}
        leadingIcon={<LuLock />}
      />

      <Button type="submit" className="w-full" loading={pending}>
        {t("login.submit")}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ register

export function RegisterForm({ locale }: { locale: Locale }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(registerAction.bind(null, locale), null);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-ink">
          {t("register.companySection")}
        </legend>
        <Input name="agencyName" required label={t("fields.agencyName")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="countryCode"
            required
            maxLength={2}
            defaultValue="EG"
            dir="ltr"
            label={t("fields.countryCode")}
            hint={t("fields.countryCodeHint")}
          />
          <Input name="city" label={t("fields.city")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="commercialRegNo" label={t("fields.commercialRegNo")} />
          <Input name="taxId" label={t("fields.taxId")} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-border pt-5">
        <legend className="mb-3 text-sm font-semibold text-ink">
          {t("register.contactSection")}
        </legend>
        <Input name="fullName" required label={t("fields.fullName")} leadingIcon={<LuUser />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            dir="ltr"
            label={t("fields.email")}
            leadingIcon={<LuMail />}
          />
          <Input name="phone" type="tel" required dir="ltr" label={t("fields.phone")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            label={t("fields.password")}
            hint={t("fields.passwordHint")}
            leadingIcon={<LuLock />}
          />
          <Input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            label={t("fields.confirmPassword")}
            leadingIcon={<LuLock />}
          />
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-muted">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] border-border-strong accent-brand-600"
        />
        <span>{t("register.acceptTerms")}</span>
      </label>

      <Button type="submit" className="w-full" loading={pending}>
        {t("register.submit")}
      </Button>
    </form>
  );
}

// ----------------------------------------------------------- forgot password

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction.bind(null, locale),
    null,
  );

  // Once the neutral confirmation is shown, the form is replaced — resubmitting
  // would only help someone probing which addresses exist.
  if (state?.ok) return <FormMessage state={state} />;

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Input
        name="email"
        type="email"
        autoComplete="email"
        required
        dir="ltr"
        label={t("fields.email")}
        leadingIcon={<LuMail />}
      />
      <Button type="submit" className="w-full" loading={pending}>
        {t("forgotPassword.submit")}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------ reset password

export function ResetPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    updatePasswordAction.bind(null, locale),
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Input
        name="password"
        type="password"
        autoComplete="new-password"
        required
        label={t("fields.newPassword")}
        hint={t("fields.passwordHint")}
        leadingIcon={<LuLock />}
      />
      <Input
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        label={t("fields.confirmPassword")}
        leadingIcon={<LuLock />}
      />
      <Button type="submit" className="w-full" loading={pending}>
        {t("resetPassword.submit")}
      </Button>
    </form>
  );
}
