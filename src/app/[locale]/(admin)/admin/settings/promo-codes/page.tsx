import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { createClient } from "@/shared/lib/supabase/server";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listPromoCodes } from "@/modules/finance/infrastructure/finance.repository";
import { PromoManager } from "@/modules/finance/presentation/promo-manager";

/** Promo code settings (CLAUDE.md §13, Phase 5b). */
export default async function PromoCodesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "finance.settings.manage")) forbidden();

  const t = await getTranslations("promos");
  const supabase = await createClient();
  const [promos, { data: agencies }] = await Promise.all([
    listPromoCodes(),
    supabase.from("agencies").select("id, name").eq("status", "active").order("name").limit(500),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <PromoManager promos={promos} agencies={agencies ?? []} locale={locale} />
    </main>
  );
}
