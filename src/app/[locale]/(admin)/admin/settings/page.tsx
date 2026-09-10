import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import {
  LuBuilding2,
  LuChevronLeft,
  LuChevronRight,
  LuPercent,
  LuPlug,
  LuReceipt,
  LuTicket,
} from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { Card, CardBody } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";

/** Settings index — only the areas this user may actually open. */
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  const canSuppliers = can(user, "settings.suppliers.manage");
  const canMarkup = can(user, "settings.markup.manage");
  const canFinance = can(user, "finance.settings.manage");
  if (!canSuppliers && !canMarkup && !canFinance) forbidden();

  const t = await getTranslations("settings");
  const Chevron = locale === "ar" ? LuChevronLeft : LuChevronRight;

  const items = [
    { key: "suppliers", href: "/admin/settings/suppliers", icon: LuPlug, visible: canSuppliers },
    { key: "markup", href: "/admin/settings/markup", icon: LuPercent, visible: canMarkup },
    { key: "tax", href: "/admin/settings/tax", icon: LuReceipt, visible: canFinance },
    { key: "promoCodes", href: "/admin/settings/promo-codes", icon: LuTicket, visible: canFinance },
    { key: "company", href: "/admin/settings/company", icon: LuBuilding2, visible: canFinance },
  ] as const;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items
          .filter((i) => i.visible)
          .map(({ key, href, icon: Icon }) => (
            <Link key={key} href={href} className="group">
              <Card className="h-full transition-colors group-hover:border-brand-300">
                <CardBody className="flex items-start gap-3">
                  <span className="rounded-control bg-brand-50 p-2.5">
                    <Icon className="size-5 text-brand-600" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{t(`${key}.title`)}</span>
                    <span className="block text-sm text-ink-muted">{t(`${key}.description`)}</span>
                  </span>
                  <Chevron className="mt-1 size-4 shrink-0 text-ink-subtle" aria-hidden />
                </CardBody>
              </Card>
            </Link>
          ))}
      </div>
    </main>
  );
}
