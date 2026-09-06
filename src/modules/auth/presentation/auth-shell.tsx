import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Card, CardBody } from "@/shared/ui/card";

/**
 * Shared frame for every auth screen: centred card, wordmark, locale switcher.
 * A Server Component — none of this chrome needs client JavaScript.
 */
export async function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
}: {
  locale: Locale;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = await getTranslations();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-lg items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          {t("app.name")}
        </Link>
        <LocaleSwitcher current={locale} label={t("common.language")} />
      </div>

      <Card className="w-full max-w-lg">
        <CardBody className="space-y-5 p-6 sm:p-8">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {children}
        </CardBody>
      </Card>

      {footer ? <div className="text-sm text-ink-muted">{footer}</div> : null}
    </main>
  );
}
