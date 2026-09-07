import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { Button } from "@/shared/ui/button";

/**
 * Landing spot for an email link that could not be used.
 *
 * The reason comes from `/api/auth/confirm` and is narrowed against this list
 * rather than passed to `t()` directly, so a hand-edited query string cannot
 * probe the message catalogue for keys that are not error copy.
 */
const REASONS = ["expired", "invalid", "wrongBrowser"] as const;
type Reason = (typeof REASONS)[number];

/** Landing spot for an expired, misdirected or malformed email link. */
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
      subtitle={t(REASONS.includes(reason as Reason) ? (reason as Reason) : "invalid")}
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
