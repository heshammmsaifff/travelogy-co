import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { Button } from "@/shared/ui/button";

/** Landing spot for an expired or malformed email link. */
export default async function AuthErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { reason } = await searchParams;
  const t = await getTranslations("auth.authError");

  return (
    <AuthShell
      locale={locale}
      title={t("title")}
      subtitle={reason === "expired" ? t("expired") : t("invalid")}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="flex-1">
          <Link href="/forgot-password">{t("requestNew")}</Link>
        </Button>
        <Button asChild variant="secondary" className="flex-1">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
