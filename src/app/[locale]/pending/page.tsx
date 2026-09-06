import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { LuBan, LuClock, LuCircleX } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";

/**
 * Where a signed-in but not-yet-active account lands.
 *
 * Covers three distinct states honestly rather than showing one vague message:
 * awaiting approval, rejected, and suspended each say what actually happened
 * and what the person can do about it (CLAUDE.md §2.3).
 */
export default async function PendingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  // An active account has no business here.
  if (user.status === "active") redirect(`/${locale}/redirect`);

  const t = await getTranslations("auth.pending");

  const view = {
    pending: { Icon: LuClock, tone: "text-warning-600", bg: "bg-warning-50" },
    rejected: { Icon: LuCircleX, tone: "text-danger-600", bg: "bg-danger-50" },
    suspended: { Icon: LuBan, tone: "text-danger-600", bg: "bg-danger-50" },
    active: { Icon: LuClock, tone: "text-brand-600", bg: "bg-brand-50" },
  }[user.status];

  const { Icon } = view;

  return (
    <AuthShell locale={locale} title={t(`${user.status}.title`)}>
      <div className="space-y-5">
        <div className={`flex items-start gap-3 rounded-control p-4 ${view.bg}`}>
          <Icon className={`mt-0.5 size-5 shrink-0 ${view.tone}`} aria-hidden />
          <p className="text-sm text-ink">{t(`${user.status}.body`)}</p>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("accountEmail")}</dt>
            <dd className="font-medium text-ink" dir="ltr">
              {user.email}
            </dd>
          </div>
          {user.agency ? (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("companyName")}</dt>
                <dd className="font-medium text-ink">{user.agency.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("reference")}</dt>
                <dd className="font-mono text-xs text-ink-muted" dir="ltr">
                  {user.agency.code}
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        <SignOutButton locale={locale} />
      </div>
    </AuthShell>
  );
}
