"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  LuUpload,
  LuFileSpreadsheet,
  LuCircleCheck,
  LuDownload,
} from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import {
  uploadAndPreviewStaticRatesAction,
  commitStaticRatesAction,
} from "./static-rates-actions";
import type {
  ParseResult,
  RowValidationResult,
} from "@/modules/hotels/application/import-static-rates.service";

function generateSampleStaticRatesCsv(): string {
  return [
    "hotel_code,room_code,plan_code,start_date,end_date,currency,net_rate,min_stay,allotment",
    "HTL001,STD,BB,2026-10-01,2026-10-31,SAR,450.00,1,10",
    "HTL001,DLX,HB,2026-10-01,2026-10-31,SAR,650.00,2,8",
    "HTL002,STE,RO,2026-11-01,2026-11-30,USD,180.00,1,5",
  ].join("\n");
}

export function StaticRatesUploader({ locale: _locale }: { locale: Locale }) {
  const t = useTranslations("staticRates");
  const tCommon = useTranslations("common");

  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ParseResult | null>(null);
  const [importedSummary, setImportedSummary] = useState<{ count: number } | null>(null);

  const handleDownloadTemplate = () => {
    const csvContent = generateSampleStaticRatesCsv();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "hotel_rates_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreviewData(null);
    setImportedSummary(null);

    if (file) {
      const formData = new FormData();
      formData.append("file", file);

      startTransition(async () => {
        const res = await uploadAndPreviewStaticRatesAction(formData);
        if (res.ok) {
          setPreviewData(res.data);
          toast.success({
            title: t("parseSuccessTitle"),
            description: t("parseSuccessDesc", {
              valid: res.data.validCount,
              total: res.data.totalRows,
            }),
          });
        } else {
          toast.error({
            title: tCommon("errors.unexpected"),
            description: res.detail,
          });
        }
      });
    }
  };

  const handleCommit = () => {
    if (!previewData) return;
    const validRows = previewData.rows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    startTransition(async () => {
      const res = await commitStaticRatesAction(validRows);
      if (res.ok) {
        setImportedSummary({ count: res.importedCount });
        setPreviewData(null);
        setSelectedFile(null);
        toast.success({
          title: t("importCompleteTitle"),
          description: t("importCompleteDesc", { count: res.importedCount }),
        });
      } else {
        toast.error({
          title: tCommon("errors.unexpected"),
          description: res.detail,
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("uploadCardTitle")}
          description={t("uploadCardDescription")}
          actions={
            <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
              <LuDownload aria-hidden />
              {t("downloadTemplate")}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-control border-2 border-dashed border-border p-8 text-center transition-colors hover:border-brand-500">
            <LuFileSpreadsheet className="size-12 text-brand-600" aria-hidden />
            <p className="mt-3 text-sm font-medium text-ink">{t("dragOrSelectFile")}</p>
            <p className="mt-1 text-xs text-ink-muted">{t("supportedFormats")}</p>

            <label className="mt-4 cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800">
                <LuUpload className="size-4 shrink-0 text-white" aria-hidden />
                <span className="font-medium text-white">{t("selectFileButton")}</span>
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                disabled={isPending}
                onChange={handleFileChange}
              />
            </label>

            {selectedFile ? (
              <p className="mt-3 text-xs text-ink-muted">
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* Success Banner */}
      {importedSummary ? (
        <div className="flex items-center gap-3 rounded-card border border-success-200 bg-success-50 p-4 text-success-800 dark:border-success-800 dark:bg-success-950/30 dark:text-success-200">
          <LuCircleCheck className="size-5 shrink-0" aria-hidden />
          <p className="text-sm font-medium">
            {t("importCompleteDesc", { count: importedSummary.count })}
          </p>
        </div>
      ) : null}

      {/* Preview Section */}
      {previewData ? (
        <Card>
          <CardHeader
            title={t("previewTitle")}
            description={t("previewStats", {
              total: previewData.totalRows,
              valid: previewData.validCount,
              errors: previewData.errorCount,
            })}
            actions={
              <Button
                variant="primary"
                size="sm"
                loading={isPending}
                disabled={previewData.validCount === 0}
                onClick={handleCommit}
              >
                <LuCircleCheck aria-hidden />
                {t("confirmImportButton", { count: previewData.validCount })}
              </Button>
            }
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="border-b border-border bg-surface-raised font-medium text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("cols.row")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.status")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.hotelCode")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.roomCode")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.planCode")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.dates")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.rate")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.allotment")}</th>
                    <th className="px-3 py-2 text-start">{t("cols.notes")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-ink">
                  {previewData.rows.map((row: RowValidationResult) => {
                    const d = row.data;
                    return (
                      <tr
                        key={row.rowNumber}
                        className={row.isValid ? "hover:bg-surface-hover" : "bg-danger-50/20 hover:bg-danger-50/40"}
                      >
                        <td className="px-3 py-2 font-mono text-ink-muted">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          <Badge tone={row.isValid ? "success" : "danger"}>
                            {row.isValid ? tCommon("status.active") : t("cols.invalid")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono font-medium">{d.hotelCode}</td>
                        <td className="px-3 py-2 font-mono">{d.roomCode}</td>
                        <td className="px-3 py-2">{d.planCode}</td>
                        <td className="px-3 py-2 font-mono text-2xs" dir="ltr">
                          {d.startDate} → {d.endDate}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {d.netRate} {d.currency}
                        </td>
                        <td className="px-3 py-2">{d.allotment}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-2xs text-danger-600 dark:text-danger-400">
                          {row.errors.join("; ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
