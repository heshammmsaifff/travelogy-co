import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { LuKeyRound } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { ChangePasswordForm } from "@/modules/auth/presentation/auth-forms";

/**
 * Forced password change for an account created by an admin.
 *
 * The admin generated and saw the temporary password, so the account is not
 * genuinely private until the user replaces it. The back-office layout sends
 * them here and will keep doing so until `must_change_password` is cleared.
 */
export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  // Nothing to force — do not leave a dead page reachable.
  if (!user.mustChangePassword) redirect(`/${locale}/redirect`);

  const t = await getTranslations("auth.changePassword");

  return (
    <AuthShell locale={locale} title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-control bg-warning-50 p-4">
          <LuKeyRound className="mt-0.5 size-5 shrink-0 text-warning-600" aria-hidden />
          <p className="text-sm text-ink">{t("why")}</p>
        </div>
        <ChangePasswordForm locale={locale} />
      </div>
    </AuthShell>
  );
}
