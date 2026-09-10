"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuExternalLink } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { formatDate } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { saveContentPageAction, type Result } from "./cms-actions";
import type { AdminContentPage } from "@/modules/cms/infrastructure/content.repository";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * The About / Privacy / Terms editor (CLAUDE.md §13, Phase 6).
 *
 * Both languages are edited side by side rather than behind a language switch:
 * these pages are legal text, and the commonest failure is one locale being
 * updated and the other quietly left stale. Seeing them together makes that
 * visible instead of easy.
 *
 * The body is PLAIN TEXT. It is rendered as paragraphs and never as HTML
 * (§15, 9.2) — a CMS field stored as text and rendered unescaped is a stored
 * XSS hole waiting for its first editor.
 */
export function ContentEditor({ pages, locale }: { pages: AdminContentPage[]; locale: Locale }) {
  const t = useTranslations("cms.pages");
  const [openSlug, setOpenSlug] = useState<string>(pages[0]?.slug ?? "");

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>

      <nav aria-label={t("title")}>
        <ul className="flex flex-wrap gap-1">
          {pages.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() => setOpenSlug(p.slug)}
                aria-current={openSlug === p.slug ? "page" : undefined}
                className={
                  "cursor-pointer rounded-control px-3 py-1.5 text-sm font-medium transition-colors " +
                  (openSlug === p.slug
                    ? "bg-brand-600 text-ink-inverse"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink")
                }
              >
                {t(`slug.${p.slug}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {pages
        .filter((p) => p.slug === openSlug)
        .map((page) => (
          <PageForm key={page.slug} page={page} locale={locale} />
        ))}
    </div>
  );
}

function PageForm({ page, locale }: { page: AdminContentPage; locale: Locale }) {
  const t = useTranslations("cms.pages");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  return (
    <Card>
      <CardHeader
        title={t(`slug.${page.slug}`)}
        description={`${t("lastUpdated")}: ${formatDate(page.updatedAt, locale)}`}
        actions={
          <Link
            href={`/${page.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
          >
            <LuExternalLink className="size-3.5" aria-hidden />
            {t("viewPublic")}
          </Link>
        }
      />
      <CardBody>
        <form
          action={(fd) =>
            startTransition(async () => {
              if (show(await saveContentPageAction(fd))) router.refresh();
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="slug" value={page.slug} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="titleAr"
              required
              defaultValue={page.titleAr}
              label={`${t("pageTitle")} (AR)`}
            />
            <Input
              name="titleEn"
              required
              dir="ltr"
              defaultValue={page.titleEn}
              label={`${t("pageTitle")} (EN)`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("body")} (AR)</span>
              <textarea
                name="bodyAr"
                required
                rows={16}
                defaultValue={page.bodyAr}
                dir="rtl"
                className="w-full rounded-control border border-border bg-surface px-3 py-2 font-sans text-sm leading-7 text-ink focus-visible:outline-2 focus-visible:outline-focus"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("body")} (EN)</span>
              <textarea
                name="bodyEn"
                required
                rows={16}
                defaultValue={page.bodyEn}
                dir="ltr"
                className="w-full rounded-control border border-border bg-surface px-3 py-2 font-sans text-sm leading-7 text-ink focus-visible:outline-2 focus-visible:outline-focus"
              />
            </label>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
