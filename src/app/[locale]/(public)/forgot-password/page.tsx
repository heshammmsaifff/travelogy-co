import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { ForgotPasswordForm } from "@/modules/auth/presentation/auth-forms";

export default async function ForgotPasswordPage({
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
      title={t("forgotPassword.title")}
      subtitle={t("forgotPassword.subtitle")}
      footer={
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          {t("forgotPassword.backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm locale={locale} />
    </AuthShell>
  );
}
