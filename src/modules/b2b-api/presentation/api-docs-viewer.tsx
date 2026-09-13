"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  LuCode,
  LuCopy,
  LuCheck,
  LuExternalLink,
  LuShield,
  LuGauge,
  LuFileText,
} from "react-icons/lu";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";

export function ApiDocsViewer({
  samplePrefix = "llt_live_your_secret_key",
}: {
  samplePrefix?: string;
}) {
  const t = useTranslations("b2bApi");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success({ title: t("copiedToClipboard") });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const endpoints = [
    {
      method: "GET",
      path: "/api/v1/b2b/hotels/search",
      summary: t("docs.searchSummary"),
      description: t("docs.searchDesc"),
      curl: `curl -X GET "https://travelogy.co/api/v1/b2b/hotels/search?checkIn=2026-10-15&checkOut=2026-10-18&adults=2&city=Riyadh" \\\n  -H "X-API-Key: ${samplePrefix}" \\\n  -H "Accept: application/json"`,
    },
    {
      method: "GET",
      path: "/api/v1/b2b/hotels/{id}",
      summary: t("docs.hotelDetailSummary"),
      description: t("docs.hotelDetailDesc"),
      curl: `curl -X GET "https://travelogy.co/api/v1/b2b/hotels/HTL001" \\\n  -H "X-API-Key: ${samplePrefix}" \\\n  -H "Accept: application/json"`,
    },
    {
      method: "POST",
      path: "/api/v1/b2b/bookings",
      summary: t("docs.createBookingSummary"),
      description: t("docs.createBookingDesc"),
      curl: `curl -X POST "https://travelogy.co/api/v1/b2b/bookings" \\\n  -H "X-API-Key: ${samplePrefix}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "roomTypeId": "21382458-bf66-419b-ab0d-13c328db94ea",\n    "ratePlanId": "65b533e4-c5a4-4a46-81cf-9076fdfbc26a",\n    "checkIn": "2026-10-15",\n    "checkOut": "2026-10-18",\n    "adults": 2,\n    "rooms": 1,\n    "guest": {\n      "name": "Ahmed Al-Mansoor",\n      "email": "ahmed@example.com",\n      "phone": "+966501234567"\n    },\n    "clientReference": "OTA-ORDER-4412"\n  }'`,
    },
    {
      method: "GET",
      path: "/api/v1/b2b/bookings/{idOrRef}",
      summary: t("docs.getBookingSummary"),
      description: t("docs.getBookingDesc"),
      curl: `curl -X GET "https://travelogy.co/api/v1/b2b/bookings/LLT-B-000123" \\\n  -H "X-API-Key: ${samplePrefix}" \\\n  -H "Accept: application/json"`,
    },
    {
      method: "POST",
      path: "/api/v1/b2b/bookings/{idOrRef}/cancel",
      summary: t("docs.cancelBookingSummary"),
      description: t("docs.cancelBookingDesc"),
      curl: `curl -X POST "https://travelogy.co/api/v1/b2b/bookings/LLT-B-000123/cancel" \\\n  -H "X-API-Key: ${samplePrefix}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"reason": "Client cancelled"}'`,
    },
    {
      method: "GET",
      path: "/api/v1/b2b/account/balance",
      summary: t("docs.balanceSummary"),
      description: t("docs.balanceDesc"),
      curl: `curl -X GET "https://travelogy.co/api/v1/b2b/account/balance" \\\n  -H "X-API-Key: ${samplePrefix}" \\\n  -H "Accept: application/json"`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-primary">
            <LuShield className="size-5" aria-hidden />
            <h2 className="text-sm font-semibold">{t("authGuideTitle")}</h2>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
            {t("authGuideBody")}
          </p>
          <code className="mt-2 block rounded bg-surface-raised px-2 py-1 font-mono text-2xs text-ink" dir="ltr">
            X-API-Key: llt_live_...
          </code>
        </div>

        <div className="rounded-card border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-warning-700 dark:text-warning-400">
            <LuGauge className="size-5" aria-hidden />
            <h2 className="text-sm font-semibold">{t("rateLimitsTitle")}</h2>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
            {t("rateLimitsBody")}
          </p>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-2xs text-ink" dir="ltr">
            <span>X-RateLimit-Limit</span>
            <span>·</span>
            <span>X-RateLimit-Remaining</span>
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-success-700 dark:text-success-400">
            <LuFileText className="size-5" aria-hidden />
            <h2 className="text-sm font-semibold">{t("specTitle")}</h2>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
            {t("specBody")}
          </p>
          <a
            href="/api/v1/b2b/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <span>{t("viewOpenApiJson")}</span>
            <LuExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>

      {/* Endpoints Reference */}
      <Card>
        <CardHeader
          title={t("endpointsReferenceTitle")}
          description={t("endpointsReferenceDesc")}
          actions={
            <a
              href="/api/v1/b2b/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-hover"
            >
              <LuCode className="size-3.5" aria-hidden />
              <span>OpenAPI 3.1 JSON</span>
            </a>
          }
        />
        <CardBody className="divide-y divide-border p-0">
          {endpoints.map((ep, idx) => {
            const isGet = ep.method === "GET";
            const tone = isGet ? "brand" : "warning";

            return (
              <div key={ep.path + ep.method} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Badge tone={tone}>{ep.method}</Badge>
                    <span className="font-mono text-xs font-semibold text-ink" dir="ltr">
                      {ep.path}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-ink-muted">{ep.summary}</span>
                </div>

                <p className="text-xs text-ink-muted">{ep.description}</p>

                {/* Curl Box */}
                <div className="relative rounded-control border border-neutral-800 bg-neutral-950 p-3 text-neutral-100 dark:border-border dark:bg-surface-raised">
                  <div className="flex items-center justify-between pb-2 text-2xs text-neutral-400">
                    <span>cURL Example</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(ep.curl, idx)}
                      className="h-6 px-2 text-2xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    >
                      {copiedIndex === idx ? (
                        <LuCheck className="size-3 text-success-400" aria-hidden />
                      ) : (
                        <LuCopy className="size-3" aria-hidden />
                      )}
                      <span>{copiedIndex === idx ? t("copied") : t("copy")}</span>
                    </Button>
                  </div>
                  <pre className="overflow-x-auto font-mono text-2xs text-amber-400 leading-relaxed" dir="ltr">
                    {ep.curl}
                  </pre>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
