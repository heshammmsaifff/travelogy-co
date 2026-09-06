"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { LuUpload } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { formatBytes, formatNumber } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
import { toast } from "@/shared/lib/toast";
import { uploadImage, type UploadResult } from "@/shared/lib/upload-image";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

/**
 * End-to-end proof of the media pipeline (CLAUDE.md §8):
 * compress to WebP in the browser -> signed upload -> Cloudinary ->
 * render through an f_auto,q_auto transformation URL.
 *
 * The result panel reports real before/after byte counts, so the compression
 * step is demonstrably doing something rather than merely being wired up.
 */
export function UploadDemo({ locale }: { locale: Locale }) {
  const t = useTranslations("devKitchenSink.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "compressing" | "uploading">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error({ title: t("failed"), description: t("notAnImage") });
      return;
    }

    try {
      const uploaded = await uploadImage(file, {
        folder: "phase0-test",
        preset: "photo",
        onStage: setStage,
      });
      setResult(uploaded);
      toast.success({ title: t("resultTitle"), description: t("resultBody") });
    } catch (error) {
      toast.error({
        title: t("failed"),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setStage("idle");
      // Reset so re-picking the same file fires onChange again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = stage !== "idle";
  const savedPercent = result
    ? Math.max(0, Math.round((1 - result.uploadedBytes / result.originalBytes) * 100))
    : 0;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="sr-only"
        id="phase0-upload"
      />

      <Button size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
        {!busy ? <LuUpload aria-hidden /> : null}
        {stage === "compressing"
          ? t("compressing")
          : stage === "uploading"
            ? t("uploading")
            : t("choose")}
      </Button>

      {result ? (
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface-sunken p-4 sm:flex-row">
          <Image
            // Delivered through Cloudinary's f_auto,q_auto, resized to what the
            // slot actually needs rather than the full upload.
            src={cloudinaryUrl(result.secureUrl, { width: 320, height: 240, crop: "fill" })}
            alt=""
            width={160}
            height={120}
            className="h-30 w-40 shrink-0 rounded-control border border-border object-cover"
            // Cloudinary already did the resizing and format negotiation, so
            // routing this through Next's optimizer would only duplicate work.
            unoptimized
            // The user just picked this file and is waiting to see it — lazy
            // loading a preview that appears on demand is the wrong default.
            priority
          />

          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">{t("originalSize")}</dt>
            <dd className="text-ink tabular-nums">{formatBytes(result.originalBytes, locale)}</dd>

            <dt className="text-ink-muted">{t("compressedSize")}</dt>
            <dd className="text-ink tabular-nums">{formatBytes(result.uploadedBytes, locale)}</dd>

            <dt className="text-ink-muted">{t("saved")}</dt>
            <dd>
              <Badge tone={savedPercent > 0 ? "success" : "neutral"}>
                {formatNumber(savedPercent / 100, locale, { style: "percent" })}
              </Badge>
            </dd>

            <dt className="text-ink-muted">{t("publicId")}</dt>
            <dd className="min-w-0 truncate font-mono text-xs text-ink-muted" dir="ltr">
              {result.publicId}
            </dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
