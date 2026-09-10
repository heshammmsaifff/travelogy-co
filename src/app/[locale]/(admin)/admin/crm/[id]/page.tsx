import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { createClient } from "@/shared/lib/supabase/server";
import { Badge } from "@/shared/ui/badge";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  getLead,
  listActivities,
  listLinkableAgencies,
  listTasks,
} from "@/modules/crm/infrastructure/crm.repository";
import { CrmPanel } from "@/modules/crm/presentation/crm-panel";
import { LeadDetail } from "@/modules/crm/presentation/lead-detail";

/** One prospect: its details, its contact history and its follow-up. */
export default async function AdminLeadPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !(can(user, "crm.view") || can(user, "crm.manage"))) forbidden();

  const lead = await getLead(id);
  if (!lead) notFound();

  const t = await getTranslations("crm");
  const supabase = await createClient();
  const [activities, tasks, agencies, { data: staff }] = await Promise.all([
    listActivities({ leadId: id }),
    listTasks({ leadId: id }),
    listLinkableAgencies(),
    supabase.from("profiles").select("id, full_name").is("agency_id", null).order("full_name").limit(200),
  ]);

  const { dir } = LOCALE_META[locale];
  const Back = dir === "rtl" ? LuArrowRight : LuArrowLeft;
  const people = (staff ?? []).map((s) => ({ id: s.id, name: s.full_name }));

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Link
          href="/admin/crm"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <Back className="size-4" aria-hidden />
          {t("title")}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
          {lead.companyName}
          <Badge tone="neutral">{t(`stage.${lead.stage}`)}</Badge>
          <span className="font-mono text-sm font-normal text-ink-subtle" dir="ltr">
            {lead.reference}
          </span>
        </h1>
      </div>

      <LeadDetail lead={lead} owners={people} linkableAgencies={agencies} locale={locale} />

      <CrmPanel
        subject={{ leadId: id }}
        activities={activities}
        tasks={tasks}
        assignees={people}
        locale={locale}
      />
    </main>
  );
}
