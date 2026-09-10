import Image from "next/image";
import type { ReactNode } from "react";
import type { Locale } from "@/shared/i18n/config";
import { Card, CardBody } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { SiteHeader, SiteFooter } from "@/modules/cms/presentation/site-chrome";

/**
 * Shared frame for every auth screen: site navbar, centred card, and footer.
 * A Server Component — none of this chrome needs client JavaScript.
 */
export async function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
  cardClassName,
}: {
  locale: Locale;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  cardClassName?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader locale={locale} />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 sm:px-6">
        <Card className={cn("w-full max-w-lg shadow-raised border-border/80", cardClassName)}>
          <CardBody className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="rounded-2xl bg-[#063B4A] p-2.5 shadow-sm border border-[#D8AE4A]/40 mb-1">
                <Image
                  src="/logo.png"
                  alt="Travelogy"
                  width={44}
                  height={30}
                  className="h-7 w-auto object-contain brightness-110"
                  priority
                />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
              {subtitle ? <p className="text-sm text-ink-muted max-w-sm">{subtitle}</p> : null}
            </div>
            {children}
          </CardBody>
        </Card>

        {footer ? <div className="text-sm text-ink-muted">{footer}</div> : null}
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
