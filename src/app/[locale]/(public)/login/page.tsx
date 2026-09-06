import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { LoginForm } from "@/modules/auth/presentation/auth-forms";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ reset?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { reset } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <AuthShell
      locale={locale}
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <span>
          {t("login.noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            {t("login.registerLink")}
          </Link>
        </span>
      }
    >
      {reset ? (
        <p
          role="status"
          className="rounded-control bg-success-50 px-3 py-2 text-sm text-success-700"
        >
          {t("resetPassword.done")}
        </p>
      ) : null}

      <LoginForm locale={locale} />

      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-ink-muted hover:text-ink hover:underline"
        >
          {t("login.forgotPassword")}
        </Link>
      </div>
    </AuthShell>
  );
}
