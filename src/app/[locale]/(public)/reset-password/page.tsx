import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { ResetPasswordForm } from "@/modules/auth/presentation/auth-forms";

/**
 * Reached only through a recovery link, which establishes a session before this
 * page renders. The action re-checks that session rather than trusting arrival
 * here — an expired link would otherwise appear to succeed.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <AuthShell
      locale={locale}
      title={t("resetPassword.title")}
      subtitle={t("resetPassword.subtitle")}
    >
      <ResetPasswordForm locale={locale} />
    </AuthShell>
  );
}
