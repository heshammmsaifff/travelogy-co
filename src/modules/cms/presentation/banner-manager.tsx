"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { LuImageOff, LuPencil, LuPlus, LuTrash2, LuUpload } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatDate, formatNumber } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
import { toast } from "@/shared/lib/toast";
import { uploadImage } from "@/shared/lib/upload-image";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import {
  deleteBannerAction,
  saveBannerAction,
  setBannerActiveAction,
  type Result,
} from "./cms-actions";
import type { AdminBanner } from "@/modules/cms/infrastructure/content.repository";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * Whether a banner is on the public homepage right now.
 *
 * The same three conditions the RLS policy applies, computed here only to
 * label the row. The database is what actually decides — this is a readout,
 * not a second rule.
 */
function liveState(b: AdminBanner, now: number): "live" | "hidden" | "scheduled" | "expired" {
  if (!b.isActive) return "hidden";
  if (b.startsAt && Date.parse(b.startsAt) > now) return "scheduled";
  if (b.endsAt && Date.parse(b.endsAt) <= now) return "expired";
  return "live";
}

const STATE_TONE = {
  live: "success",
  hidden: "neutral",
  scheduled: "brand",
  expired: "warning",
} as const;

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, not an ISO string with a zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BannerManager({
  banners,
  locale,
}: {
  banners: AdminBanner[];
  locale: Locale;
}) {
  const t = useTranslations("cms.banners");
  const tCms = useTranslations("cms");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<AdminBanner | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();
  const now = Date.now();

  const current = editing === "new" ? null : editing;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <LuPlus aria-hidden />
          {t("create")}
        </Button>
      </div>

      {banners.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {banners.map((b) => {
            const state = liveState(b, now);
            return (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-3"
              >
                {b.imagePublicId ? (
                  <Image
                    src={cloudinaryUrl(b.imagePublicId, { width: 240, height: 120, crop: "fill" })}
                    alt=""
                    width={120}
                    height={60}
                    unoptimized
                    className="h-15 w-30 shrink-0 rounded-control border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-15 w-30 shrink-0 items-center justify-center rounded-control border border-dashed border-border-strong text-ink-subtle">
                    <LuImageOff className="size-4" aria-hidden />
                  </span>
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">
                      {locale === "ar" ? b.titleAr : b.titleEn}
                    </span>
                    <Badge tone={STATE_TONE[state]}>{t(state)}</Badge>
                    <span className="text-xs text-ink-subtle">
                      {t("sortOrder")}: {formatNumber(b.sortOrder, locale)}
                    </span>
                  </p>
                  {(locale === "ar" ? b.subtitleAr : b.subtitleEn) ? (
                    <p className="line-clamp-1 text-sm text-ink-muted">
                      {locale === "ar" ? b.subtitleAr : b.subtitleEn}
                    </p>
                  ) : null}
                  {b.startsAt || b.endsAt ? (
                    <p className="text-xs text-ink-subtle" dir="ltr">
                      {b.startsAt ? formatDate(b.startsAt, locale) : "—"} →{" "}
                      {b.endsAt ? formatDate(b.endsAt, locale) : "—"}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    onClick={() =>
                      startTransition(async () => {
                        if (show(await setBannerActiveAction(b.id, !b.isActive))) router.refresh();
                      })
                    }
                  >
                    {b.isActive ? t("hidden") : t("live")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("edit")}
                    onClick={() => setEditing(b)}
                  >
                    <LuPencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    aria-label={tCommon("delete")}
                    onClick={async () => {
                      const ok = await confirmAction({
                        title: t("deleteConfirmTitle"),
                        body: t("deleteConfirmBody"),
                        confirmLabel: tCommon("delete"),
                        cancelLabel: tCommon("cancel"),
                        dir: locale === "ar" ? "rtl" : "ltr",
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        if (show(await deleteBannerAction(b.id))) router.refresh();
                      });
                    }}
                  >
                    <LuTrash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BannerForm
        key={current?.id ?? (editing === "new" ? "new" : "closed")}
        banner={current}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
        errorLabel={tCms("errors.uploadFailed")}
      />
    </div>
  );
}

function BannerForm({
  banner,
  open,
  onClose,
  onSaved,
  errorLabel,
}: {
  banner: AdminBanner | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  errorLabel: string;
}) {
  const t = useTranslations("cms.banners");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [publicId, setPublicId] = useState(banner?.imagePublicId ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const show = useShow();

  // The image is uploaded before the form is submitted, so the hidden field
  // carries a public_id the server can trust to be real rather than a file it
  // would have to accept and store itself (§8).
  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file, { folder: "banners", preset: "banner" });
      setPublicId(result.publicId);
    } catch {
      toast.error({ title: errorLabel });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={banner ? t("edit") : t("create")}
      description={t("description")}
      closeLabel={tCommon("cancel")}
      size="lg"
    >
      <form
        action={(fd) =>
          startTransition(async () => {
            if (show(await saveBannerAction(fd))) onSaved();
          })
        }
        className="space-y-4"
      >
        <input type="hidden" name="id" value={banner?.id ?? ""} />
        <input type="hidden" name="imagePublicId" value={publicId} />

        <div className="space-y-2">
          <span className="block text-sm font-medium text-ink">{t("image")}</span>
          <div className="flex flex-wrap items-center gap-3">
            {publicId ? (
              <Image
                src={cloudinaryUrl(publicId, { width: 320, height: 160, crop: "fill" })}
                alt=""
                width={160}
                height={80}
                unoptimized
                className="h-20 w-40 rounded-control border border-border object-cover"
              />
            ) : (
              <span className="flex h-20 w-40 items-center justify-center rounded-control border border-dashed border-border-strong text-xs text-ink-subtle">
                {t("noImage")}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <LuUpload aria-hidden />
                {publicId ? t("replaceImage") : t("image")}
              </Button>
              {publicId ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPublicId("")}>
                  {t("removeImage")}
                </Button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <p className="text-xs text-ink-subtle">{t("imageHint")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="titleAr"
            required
            defaultValue={banner?.titleAr ?? ""}
            label={`${t("bannerTitle")} (AR)`}
          />
          <Input
            name="titleEn"
            required
            dir="ltr"
            defaultValue={banner?.titleEn ?? ""}
            label={`${t("bannerTitle")} (EN)`}
          />
          <Input
            name="subtitleAr"
            defaultValue={banner?.subtitleAr ?? ""}
            label={`${t("subtitle")} (AR)`}
          />
          <Input
            name="subtitleEn"
            dir="ltr"
            defaultValue={banner?.subtitleEn ?? ""}
            label={`${t("subtitle")} (EN)`}
          />
          <Input
            name="ctaLabelAr"
            defaultValue={banner?.ctaLabelAr ?? ""}
            label={`${t("ctaLabel")} (AR)`}
          />
          <Input
            name="ctaLabelEn"
            dir="ltr"
            defaultValue={banner?.ctaLabelEn ?? ""}
            label={`${t("ctaLabel")} (EN)`}
          />
        </div>

        <Input
          name="ctaHref"
          dir="ltr"
          defaultValue={banner?.ctaHref ?? ""}
          label={t("ctaHref")}
          hint={t("ctaHint")}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            name="sortOrder"
            type="number"
            min="0"
            max="999"
            required
            dir="ltr"
            defaultValue={String(banner?.sortOrder ?? 0)}
            label={t("sortOrder")}
          />
          <Input
            name="startsAt"
            type="datetime-local"
            dir="ltr"
            defaultValue={toLocalInput(banner?.startsAt ?? null)}
            label={t("startsAt")}
            hint={t("scheduleHint")}
          />
          <Input
            name="endsAt"
            type="datetime-local"
            dir="ltr"
            defaultValue={toLocalInput(banner?.endsAt ?? null)}
            label={t("endsAt")}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={banner?.isActive ?? true}
            className="size-4 cursor-pointer rounded border-border-strong"
          />
          {t("isActive")}
        </label>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={uploading}>
            {tCommon("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
