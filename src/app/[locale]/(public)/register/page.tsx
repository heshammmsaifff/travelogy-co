import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { RegisterForm } from "@/modules/auth/presentation/auth-forms";

export default async function RegisterPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <AuthShell
      locale={locale}
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      cardClassName="max-w-xl"
      footer={
        <span>
          {t("register.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            {t("register.loginLink")}
          </Link>
        </span>
      }
    >
      <RegisterForm locale={locale} />
    </AuthShell>
  );
}
