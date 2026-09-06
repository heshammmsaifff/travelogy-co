import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuMailCheck } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { AuthShell } from "@/modules/auth/presentation/auth-shell";
import { Button } from "@/shared/ui/button";

/**
 * Shown after a registration is submitted.
 *
 * States both steps explicitly — confirm your email, THEN wait for an admin to
 * approve you — so an agent is not left wondering why confirming their address
 * did not grant access (CLAUDE.md §2.3: never present something as finished
 * when it is not).
 */
export default async function RegisterSubmittedPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.registerSubmitted");

  return (
    <AuthShell locale={locale} title={t("title")}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-control bg-brand-50 p-4">
          <LuMailCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <p className="text-sm text-ink">{t("checkEmail")}</p>
        </div>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
