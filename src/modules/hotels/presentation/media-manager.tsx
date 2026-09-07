"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { LuStar, LuTrash2, LuUpload } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { formatBytes } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
import { toast } from "@/shared/lib/toast";
import { uploadImage } from "@/shared/lib/upload-image";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { attachImageAction, deleteImageAction, setCoverImageAction } from "./hotel-actions";
import { useResultToast } from "./hotel-forms";

type ImageRow = {
  id: string;
  roomTypeId: string | null;
  publicId: string;
  secureUrl: string;
  altAr: string | null;
  altEn: string | null;
  isCover: boolean;
  bytes: number | null;
};

/**
 * Hotel photography.
 *
 * The full pipeline from CLAUDE.md §8 runs here for the first time on real
 * content: compress to WebP in the browser, upload direct to Cloudinary with a
 * server-issued signature, persist the URL, and render through an
 * f_auto,q_auto transformation.
 *
 * Multiple files upload sequentially rather than in parallel — a hotel gallery
 * is often twenty photos, and firing twenty simultaneous uploads from a phone
 * on hotel wifi is how you get a batch of half-failures.
 */
export function MediaManager({
  hotelId,
  images,
  rooms,
  locale,
  canManage,
}: {
  hotelId: string;
  images: ImageRow[];
  rooms: { id: string; code: string; nameAr: string; nameEn: string }[];
  locale: Locale;
  canManage: boolean;
}) {
  const t = useTranslations("hotels.media");
  const tCommon = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(
    null,
  );
  const [targetRoom, setTargetRoom] = useState("");

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (files.length === 0) return;

    let succeeded = 0;
    for (const [index, file] of files.entries()) {
      if (!file.type.startsWith("image/")) {
        toast.error({ title: t("notAnImage", { name: file.name }) });
        continue;
      }

      try {
        setProgress({ done: index, total: files.length, stage: "compressing" });
        const uploaded = await uploadImage(file, {
          folder: "hotels",
          preset: "photo",
          onStage: (stage) => setProgress({ done: index, total: files.length, stage }),
        });

        const fd = new FormData();
        fd.set("hotelId", hotelId);
        fd.set("roomTypeId", targetRoom);
        fd.set("cloudinaryPublicId", uploaded.publicId);
        fd.set("secureUrl", uploaded.secureUrl);
        fd.set("width", String(uploaded.width));
        fd.set("height", String(uploaded.height));
        fd.set("bytes", String(uploaded.uploadedBytes));

        const result = await attachImageAction(fd);
        if (result.ok) succeeded += 1;
        else toast.error({ title: t("attachFailed", { name: file.name }) });
      } catch (error) {
        toast.error({
          title: t("uploadFailed", { name: file.name }),
          description: error instanceof Error ? error.message : undefined,
        });
      }
    }

    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    if (succeeded > 0) toast.success({ title: t("uploaded", { count: succeeded }) });
  }

  const hotelImages = images.filter((i) => !i.roomTypeId);
  const roomImages = images.filter((i) => i.roomTypeId);

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface-sunken p-4">
          <div className="flex w-full flex-col gap-1.5 sm:w-64">
            <label htmlFor="media-target" className="text-sm font-medium text-ink">
              {t("attachTo")}
            </label>
            <select
              id="media-target"
              value={targetRoom}
              onChange={(e) => setTargetRoom(e.target.value)}
              className="h-9 cursor-pointer rounded-control border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <option value="">{t("theProperty")}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {locale === "ar" ? r.nameAr : r.nameEn} ({r.code})
                </option>
              ))}
            </select>
          </div>

          <input
            ref={inputRef}
            id="hotel-media-input"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={handleFiles}
          />

          <Button loading={progress !== null} onClick={() => inputRef.current?.click()}>
            {progress === null ? <LuUpload aria-hidden /> : null}
            {progress
              ? t(progress.stage === "compressing" ? "compressing" : "uploading", {
                  done: progress.done + 1,
                  total: progress.total,
                })
              : t("choose")}
          </Button>

          <p className="text-xs text-ink-muted">{t("pipelineNote")}</p>
        </div>
      ) : null}

      <Gallery
        title={t("propertyGallery")}
        images={hotelImages}
        hotelId={hotelId}
        locale={locale}
        canManage={canManage}
        allowCover
        emptyLabel={t("empty")}
      />

      {roomImages.length > 0 ? (
        <Gallery
          title={t("roomGallery")}
          images={roomImages}
          hotelId={hotelId}
          locale={locale}
          canManage={canManage}
          allowCover={false}
          emptyLabel={t("empty")}
          roomLabel={(id) => {
            const room = rooms.find((r) => r.id === id);
            return room ? (locale === "ar" ? room.nameAr : room.nameEn) : "";
          }}
        />
      ) : null}

      {/* Honest note: the Cloudinary asset outlives the row on purpose. */}
      {canManage ? <p className="text-xs text-ink-subtle">{t("deleteNote")}</p> : null}

      {/* Announces upload progress to a screen reader, which otherwise gets no
          signal that a long multi-file upload is running. */}
      <span className="sr-only" aria-live="polite">
        {progress ? tCommon("loading") : ""}
      </span>
    </div>
  );
}

function Gallery({
  title,
  images,
  hotelId,
  locale,
  canManage,
  allowCover,
  emptyLabel,
  roomLabel,
}: {
  title: string;
  images: ImageRow[];
  hotelId: string;
  locale: Locale;
  canManage: boolean;
  allowCover: boolean;
  emptyLabel: string;
  roomLabel?: (roomTypeId: string) => string;
}) {
  const t = useTranslations("hotels.media");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>

      {images.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-ink-muted">
          {emptyLabel}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <li
              key={img.id}
              className="overflow-hidden rounded-card border border-border bg-surface"
            >
              <div className="relative aspect-[4/3] bg-surface-sunken">
                <Image
                  src={cloudinaryUrl(img.secureUrl, { width: 480, height: 360, crop: "fill" })}
                  alt={(locale === "ar" ? img.altAr : img.altEn) ?? ""}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 25vw"
                  className="object-cover"
                />
                {img.isCover ? (
                  <span className="absolute start-2 top-2">
                    <Badge tone="brand">{t("cover")}</Badge>
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-2xs text-ink-subtle">
                  {roomLabel && img.roomTypeId
                    ? roomLabel(img.roomTypeId)
                    : img.bytes
                      ? formatBytes(img.bytes, locale)
                      : ""}
                </span>

                {canManage ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    {allowCover && !img.isCover ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("setCover")}
                        loading={pending}
                        onClick={() =>
                          startTransition(async () => {
                            void show(await setCoverImageAction(img.id, hotelId));
                          })
                        }
                      >
                        <LuStar aria-hidden />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("remove")}
                      onClick={async () => {
                        const confirmed = await confirmAction({
                          title: t("deleteConfirmTitle"),
                          body: t("deleteConfirmBody"),
                          confirmLabel: tCommon("delete"),
                          cancelLabel: tCommon("cancel"),
                          dir: locale === "ar" ? "rtl" : "ltr",
                        });
                        if (confirmed) {
                          startTransition(async () => {
                            void show(await deleteImageAction(img.id, hotelId));
                          });
                        }
                      }}
                    >
                      <LuTrash2 aria-hidden />
                    </Button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
