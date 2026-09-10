"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LuCheck, LuExternalLink, LuMapPin, LuTriangleAlert } from "react-icons/lu";
import { Input } from "@/shared/ui/input";
import { isSafeHttpUrl, parseMapLink } from "@/shared/lib/map-link";

/**
 * The hotel's location, entered as a map link (CLAUDE.md §13, Phase 3a).
 *
 * The readout underneath is the whole point of the change. Typing two numbers
 * gave no feedback at all — a wrong digit looked exactly like a right one. A
 * pasted link either resolves to coordinates, in which case they are shown so
 * the admin can sanity-check them, or it does not, in which case it says so
 * plainly rather than saving a hotel with no position and no warning (§2.3).
 *
 * The parse runs in both places on purpose: here so the admin sees it, and in
 * the Server Action because what the browser computed is not what gets stored
 * (§12). This one is a readout; that one is the value.
 */
export function LocationField({
  defaultValue,
  latitude,
  longitude,
}: {
  defaultValue?: string | null;
  /** What is stored today, so an unchanged field still shows its position. */
  latitude?: number | null;
  longitude?: number | null;
}) {
  const t = useTranslations("hotels.fields");
  const [value, setValue] = useState(defaultValue ?? "");

  const trimmed = value.trim();
  const parsed = parseMapLink(trimmed);
  const looksLikeUrl = trimmed !== "" && isSafeHttpUrl(trimmed);

  // Nothing typed yet: fall back to whatever the hotel already has, so an
  // existing pin is not reported as missing.
  const shown =
    parsed ??
    (trimmed === "" && latitude != null && longitude != null
      ? { latitude, longitude }
      : null);

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Input
        name="locationUrl"
        type="url"
        inputMode="url"
        dir="ltr"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        label={t("locationUrl")}
        hint={t("locationUrlHint")}
        leadingIcon={<LuMapPin />}
        placeholder="https://www.google.com/maps/place/..."
      />

      {shown ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-success-700">
          <LuCheck className="size-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums" dir="ltr">
            {shown.latitude}, {shown.longitude}
          </span>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${shown.latitude},${shown.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-700 hover:underline"
          >
            <LuExternalLink className="size-3" aria-hidden />
            {t("openInMaps")}
          </a>
        </p>
      ) : trimmed === "" ? null : looksLikeUrl ? (
        <p className="flex items-start gap-2 text-xs text-warning-700">
          <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("locationUrlNoCoordinates")}
        </p>
      ) : (
        <p className="flex items-start gap-2 text-xs text-danger-700">
          <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("locationUrlInvalid")}
        </p>
      )}
    </div>
  );
}
