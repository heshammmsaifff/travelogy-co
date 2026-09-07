import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { formatDate, formatNumber } from "@/shared/lib/format";
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
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listOffers } from "@/modules/hotels/infrastructure/hotels.repository";
import { AddOfferButton, OfferRowActions } from "@/modules/hotels/presentation/offer-manager";

export default async function OffersPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.offers.manage")) forbidden();

  const t = await getTranslations("hotels.offers");
  const offers = await listOffers(id);

  return (
    <Card>
      <CardHeader
        title={t("title")}
        description={t("description")}
        actions={<AddOfferButton hotelId={id} />}
      />
      <TableShell>
        <TableHead>
          <TableHeaderCell>{t("colOffer")}</TableHeaderCell>
          <TableHeaderCell>{t("colType")}</TableHeaderCell>
          <TableHeaderCell>{t("colStayWindow")}</TableHeaderCell>
          <TableHeaderCell numeric>{t("colDiscount")}</TableHeaderCell>
          <TableHeaderCell>{t("colStatus")}</TableHeaderCell>
          <TableHeaderCell />
        </TableHead>
        <TableBody>
          {offers.length === 0 ? (
            <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>
          ) : (
            offers.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <span className="font-medium text-ink">
                    {locale === "ar" ? o.nameAr : o.nameEn}
                  </span>
                  {o.minNights ? (
                    <span className="block text-2xs text-ink-subtle">
                      {t("minNightsSummary", { count: formatNumber(o.minNights, locale) })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{t(`types.${o.offerType}`)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(o.stayFrom, locale)} — {formatDate(o.stayTo, locale)}
                </TableCell>
                <TableCell numeric>
                  {o.discountType === "percentage"
                    ? `${formatNumber(o.discountValue, locale)}%`
                    : formatNumber(o.discountValue, locale)}
                </TableCell>
                <TableCell>
                  <Badge tone={o.isActive ? "success" : "neutral"}>
                    {t(o.isActive ? "active" : "inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <OfferRowActions offer={o} hotelId={id} locale={locale} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </TableShell>
    </Card>
  );
}
