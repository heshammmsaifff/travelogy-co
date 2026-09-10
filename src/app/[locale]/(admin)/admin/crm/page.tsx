import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { createClient } from "@/shared/lib/supabase/server";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getPipelineSummary, listLeads } from "@/modules/crm/infrastructure/crm.repository";
import { LeadBoard } from "@/modules/crm/presentation/lead-board";

/** The prospect pipeline (CLAUDE.md §13, Phase 8d). */
export default async function AdminCrmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !(can(user, "crm.view") || can(user, "crm.manage"))) forbidden();

  const t = await getTranslations("crm");
  const sp = await searchParams;

  const supabase = await createClient();
  const [leads, counts, { data: staff }] = await Promise.all([
    listLeads({ q: sp.q }),
    getPipelineSummary(),
    // Owners are back-office people, so the list is profiles with no agency.
    supabase.from("profiles").select("id, full_name").is("agency_id", null).order("full_name").limit(200),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <LeadBoard
        leads={leads}
        counts={counts}
        owners={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name }))}
        locale={locale}
      />
    </main>
  );
}
