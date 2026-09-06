import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LuBuilding2, LuPlus, LuSearch } from "react-icons/lu";
import { isLocale, LOCALE_META } from "@/shared/i18n/config";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import { ConfirmDemo, ModalDemo, ToastDemos } from "./_components/feedback-demos";
import { UploadDemo } from "./_components/upload-demo";

/**
 * Phase 0 verification page.
 *
 * INTERNAL. This is the living reference for the design tokens and shared
 * primitives, and the page used to prove the Phase 0 foundation works in both
 * directions. It is not part of the product.
 *
 * TODO (Phase 10): exclude this route from the production build before launch.
 */

/** Static sample rows — this page has no data source behind it by design. */
const SAMPLE_ROWS = [
  {
    ref: "LLT-24081",
    agency: { ar: "وكالة النيل للسفريات", en: "Nile Travel Agency" },
    status: "confirmed",
    amount: 18450,
    date: "2026-09-02",
  },
  {
    ref: "LLT-24082",
    agency: { ar: "مجموعة الشرق للسياحة", en: "Orient Tourism Group" },
    status: "pending",
    amount: 7320.5,
    date: "2026-09-04",
  },
  {
    ref: "LLT-24083",
    agency: { ar: "رحلات البحر الأحمر", en: "Red Sea Voyages" },
    status: "cancelled",
    amount: 2100,
    date: "2026-09-05",
  },
] as const;

/** Explicit maps rather than a built key, so the message keys stay type-checked. */
const STATUS_TONES = { confirmed: "success", pending: "warning", cancelled: "danger" } as const;
const STATUS_LABEL_KEYS = {
  confirmed: "table.statusConfirmed",
  pending: "table.statusPending",
  cancelled: "table.statusCancelled",
} as const;

export default async function UiKitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // See isLocale(): a dotted path such as /favicon.ico reaches this route.
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("devKitchenSink");
  const tCommon = await getTranslations("common");
  const { dir } = LOCALE_META[locale];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
            <Badge tone="brand">{t("phaseBadge")}</Badge>
          </div>
          <p className="max-w-prose text-sm text-ink-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher current={locale} label={tCommon("language")} />
      </header>

      {/* ── Locale & direction ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("localeSection.title")} description={t("localeSection.description")} />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">{t("localeSection.activeLocale")}</dt>
              <dd className="font-medium text-ink">{LOCALE_META[locale].nativeName}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t("localeSection.direction")}</dt>
              <dd className="font-mono text-ink" dir="ltr">
                {dir}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t("localeSection.sampleNumber")}</dt>
              <dd className="text-ink tabular-nums">{formatNumber(1234567.89, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t("localeSection.sampleCurrency")}</dt>
              <dd className="text-ink tabular-nums">{formatCurrency(18450, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t("localeSection.sampleDate")}</dt>
              <dd className="text-ink">{formatDate("2026-09-06", locale)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {/* ── Buttons ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("buttons.title")} description={t("buttons.description")} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>{t("buttons.primary")}</Button>
            <Button variant="secondary">{t("buttons.secondary")}</Button>
            <Button variant="ghost">{t("buttons.ghost")}</Button>
            <Button variant="danger">{t("buttons.danger")}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">
              <LuPlus aria-hidden />
              {t("buttons.withIcon")}
            </Button>
            <Button size="md" loading>
              {t("buttons.loading")}
            </Button>
            <Button size="lg" disabled>
              {tCommon("comingSoon")}
            </Button>
            <Button size="icon" variant="secondary" aria-label={tCommon("search")}>
              <LuSearch aria-hidden />
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ── Inputs ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("inputs.title")} description={t("inputs.description")} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("inputs.agencyName")}
            placeholder={t("inputs.agencyNamePlaceholder")}
            hint={t("inputs.agencyNameHint")}
            leadingIcon={<LuBuilding2 />}
            required
          />
          <Input
            label={t("inputs.emailLabel")}
            defaultValue="not-an-email"
            error={t("inputs.emailError")}
            dir="ltr"
          />
        </CardBody>
      </Card>

      {/* ── Feedback ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("toasts.title")} description={t("toasts.description")} />
        <CardBody>
          <ToastDemos />
        </CardBody>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader title={t("dialogs.title")} description={t("dialogs.description")} />
          <CardBody>
            <ConfirmDemo dir={dir} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("modal.title")} description={t("modal.description")} />
          <CardBody>
            <ModalDemo />
          </CardBody>
        </Card>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("table.title")} description={t("table.description")} />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("table.colRef")}</TableHeaderCell>
            <TableHeaderCell>{t("table.colAgency")}</TableHeaderCell>
            <TableHeaderCell>{t("table.colStatus")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("table.colAmount")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("table.colDate")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {SAMPLE_ROWS.map((row) => (
              <TableRow key={row.ref}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {row.ref}
                </TableCell>
                <TableCell>{row.agency[locale]}</TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONES[row.status]}>{t(STATUS_LABEL_KEYS[row.status])}</Badge>
                </TableCell>
                <TableCell numeric>{formatCurrency(row.amount, locale)}</TableCell>
                <TableCell numeric>{formatDate(row.date, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      </Card>

      {/* ── Cloudinary pipeline ────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("upload.title")} description={t("upload.description")} />
        <CardBody>
          <UploadDemo locale={locale} />
        </CardBody>
      </Card>
    </main>
  );
}
