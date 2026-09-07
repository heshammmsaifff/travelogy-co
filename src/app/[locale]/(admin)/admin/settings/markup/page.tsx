import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardHeader } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import { createClient } from "@/shared/lib/supabase/server";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { AddMarkupButton, MarkupRowActions } from "@/modules/hotels/presentation/markup-manager";

const SCOPE_TONES = {
  agency_hotel: "danger",
  hotel: "warning",
  agency: "brand",
  global: "neutral",
} as const;

/** Markup rules. Most specific wins: agency+hotel, hotel, agency, global. */
export default async function MarkupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "settings.markup.manage")) forbidden();

  const t = await getTranslations("markup");
  const supabase = await createClient();

  const [{ data: rules }, { data: agencies }, { data: hotels }] = await Promise.all([
    supabase
      .from("markup_rules")
      .select(
        "id, scope, agency_id, hotel_id, markup_type, markup_value, note, agencies(name), hotels(name_en, name_ar)",
      )
      .eq("is_active", true)
      .order("scope"),
    supabase.from("agencies").select("id, name, code").order("name").limit(500),
    supabase.from("hotels").select("id, name_en, name_ar, code").order("name_en").limit(500),
  ]);

  const agencyOptions = (agencies ?? []).map((a) => ({ id: a.id, label: `${a.name} (${a.code})` }));
  const hotelOptions = (hotels ?? []).map((h) => ({
    id: h.id,
    label: `${locale === "ar" ? h.name_ar : h.name_en} (${h.code})`,
  }));

  // Presented most specific first, mirroring how resolve_markup() picks.
  const order = { agency_hotel: 1, hotel: 2, agency: 3, global: 4 } as const;
  const sorted = [...(rules ?? [])].sort(
    (a, b) =>
      (order[a.scope as keyof typeof order] ?? 9) - (order[b.scope as keyof typeof order] ?? 9),
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardHeader
          title={t("listTitle")}
          description={t("precedence")}
          actions={<AddMarkupButton agencies={agencyOptions} hotels={hotelOptions} />}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("colScope")}</TableHeaderCell>
            <TableHeaderCell>{t("colApplies")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("colMarkup")}</TableHeaderCell>
            <TableHeaderCell>{t("colNote")}</TableHeaderCell>
            <TableHeaderCell />
          </TableHead>
          <TableBody>
            {sorted.length === 0 ? (
              <TableEmpty colSpan={5}>{t("empty")}</TableEmpty>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge tone={SCOPE_TONES[r.scope as keyof typeof SCOPE_TONES] ?? "neutral"}>
                      {t(`scope.${r.scope}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-ink">
                      {[
                        r.agencies?.name,
                        r.hotels ? (locale === "ar" ? r.hotels.name_ar : r.hotels.name_en) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("everything")}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    {r.markup_type === "percentage"
                      ? `${formatNumber(Number(r.markup_value), locale)}%`
                      : formatNumber(Number(r.markup_value), locale)}
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted">{r.note ?? "—"}</TableCell>
                  <TableCell>
                    <MarkupRowActions
                      rule={{
                        id: r.id,
                        scope: r.scope,
                        agencyId: r.agency_id,
                        hotelId: r.hotel_id,
                        markupType: r.markup_type,
                        markupValue: Number(r.markup_value),
                        note: r.note,
                      }}
                      agencies={agencyOptions}
                      hotels={hotelOptions}
                      locale={locale}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>
      </Card>
    </main>
  );
}
