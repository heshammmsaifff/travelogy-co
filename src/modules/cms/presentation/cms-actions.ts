"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  CONTENT_SLUGS,
  saveHomepageContent,
} from "@/modules/cms/infrastructure/content.repository";
import {
  saveHomepageContentSchema,
  type SaveHomepageContentInput,
} from "@/modules/cms/application/schemas";

/**
 * CMS mutations (CLAUDE.md §13, Phase 6).
 *
 * Phase 4 built the tables and made the public site read them; this is the
 * editor. Everything here is gated on `cms.content.publish` in the application
 * layer AND by RLS — the permission that Phase 4 found missing from the
 * registry entirely (§15, 9.3).
 */

export type Result =
  | { ok: true; messageKey: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

/** Blank datetime-local inputs arrive as "", which is not a null timestamp. */
const optionalTimestamp = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

/**
 * Revalidates every public surface a content change can appear on.
 *
 * The marketing pages are dynamic (they read through the request-scoped client),
 * but they are still cached per render — without this an admin publishes a
 * banner and then cannot see it, which reads as the save having failed.
 */
function revalidatePublicSite() {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/about", "page");
  revalidatePath("/[locale]/privacy", "page");
  revalidatePath("/[locale]/terms", "page");
  revalidatePath("/[locale]/admin/content", "page");
}

// ------------------------------------------------------------------- banners

const bannerSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    titleAr: z.string().trim().min(2).max(200),
    titleEn: z.string().trim().min(2).max(200),
    subtitleAr: optionalText(400),
    subtitleEn: optionalText(400),
    imagePublicId: optionalText(300),
    ctaLabelAr: optionalText(80),
    ctaLabelEn: optionalText(80),
    ctaHref: optionalText(500),
    sortOrder: z.coerce.number().int().min(0).max(999),
    isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    startsAt: optionalTimestamp,
    endsAt: optionalTimestamp,
  })
  // Mirrors the database CHECK so the admin gets a field message rather than a
  // constraint violation.
  .refine(
    (d) =>
      (!d.ctaHref && !d.ctaLabelAr && !d.ctaLabelEn) ||
      (!!d.ctaHref && !!d.ctaLabelAr && !!d.ctaLabelEn),
    { path: ["ctaHref"], message: "cms.errors.ctaIncomplete" },
  )
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, {
    path: ["endsAt"],
    message: "cms.errors.windowOrder",
  });

export async function saveBannerAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("cms.content.publish");
  } catch {
    return FORBIDDEN;
  }

  const parsed = bannerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: parsed.error.issues[0]?.message ?? "cms.errors.invalidInput",
    };
  }

  const d = parsed.data;
  const payload = {
    title_ar: d.titleAr,
    title_en: d.titleEn,
    subtitle_ar: d.subtitleAr ?? null,
    subtitle_en: d.subtitleEn ?? null,
    image_public_id: d.imagePublicId ?? null,
    cta_label_ar: d.ctaLabelAr ?? null,
    cta_label_en: d.ctaLabelEn ?? null,
    cta_href: d.ctaHref ?? null,
    sort_order: d.sortOrder,
    is_active: d.isActive,
    starts_at: d.startsAt ?? null,
    ends_at: d.endsAt ?? null,
    updated_by: actor.id,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("banners").update(payload).eq("id", d.id)
    : await supabase.from("banners").insert(payload);

  if (error) {
    console.error("[cms] banner save failed:", describeDbError(error));
    return { ok: false, errorKey: "cms.errors.saveFailed" };
  }

  revalidatePublicSite();
  return { ok: true, messageKey: "cms.bannerSaved" };
}

export async function deleteBannerAction(id: string): Promise<Result> {
  try {
    await requirePermission("cms.content.publish");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("banners").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "cms.errors.saveFailed" };

  // The Cloudinary asset is deliberately left in place, for the same reason a
  // deleted hotel image is (§15, 6.8): destroying it needs a signed call, and
  // an orphaned asset is cheaper than one deleted while something still
  // references it. A sweep is a Phase 10 item.
  revalidatePublicSite();
  return { ok: true, messageKey: "cms.bannerDeleted" };
}

/** Quick on/off from the list, without opening the whole form. */
export async function setBannerActiveAction(id: string, isActive: boolean): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("cms.content.publish");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("banners")
    .update({ is_active: isActive, updated_by: actor.id })
    .eq("id", id);

  if (error) return { ok: false, errorKey: "cms.errors.saveFailed" };

  revalidatePublicSite();
  return { ok: true, messageKey: isActive ? "cms.bannerActivated" : "cms.bannerDeactivated" };
}

// -------------------------------------------------------------- content pages

const contentSchema = z.object({
  slug: z.enum(CONTENT_SLUGS),
  titleAr: z.string().trim().min(2).max(200),
  titleEn: z.string().trim().min(2).max(200),
  // Plain text, deliberately. It is rendered as paragraphs and never as HTML
  // (§15, 9.2) — this field is edited by a non-developer.
  bodyAr: z.string().trim().min(10).max(20000),
  bodyEn: z.string().trim().min(10).max(20000),
});

export async function saveContentPageAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("cms.content.publish");
  } catch {
    return FORBIDDEN;
  }

  const parsed = contentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "cms.errors.invalidInput",
      detail: parsed.error.issues[0]?.path.join("."),
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  // UPDATE only: the slug set is fixed by a CHECK and the three rows are
  // seeded, so there is no INSERT policy to reach even if this tried.
  const { error } = await supabase
    .from("content_pages")
    .update({
      title_ar: d.titleAr,
      title_en: d.titleEn,
      body_ar: d.bodyAr,
      body_en: d.bodyEn,
      updated_by: actor.id,
    })
    .eq("slug", d.slug);

  if (error) {
    console.error("[cms] content page save failed:", describeDbError(error));
    return { ok: false, errorKey: "cms.errors.saveFailed" };
  }

  revalidatePublicSite();
  return { ok: true, messageKey: "cms.pageSaved" };
}

// ----------------------------------------------------------- homepage content

export async function saveHomepageContentAction(
  input: SaveHomepageContentInput,
): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("cms.content.publish");
  } catch (err) {
    console.error("[cms] requirePermission failed in saveHomepageContentAction:", err);
    return FORBIDDEN;
  }

  const parsed = saveHomepageContentSchema.safeParse(input);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    console.error("[cms] schema validation failed in saveHomepageContentAction:", errorDetails);
    return {
      ok: false,
      errorKey: "cms.errors.invalidInput",
      detail: errorDetails,
    };
  }

  const res = await saveHomepageContent(parsed.data, actor.id);
  if (!res.ok) {
    console.error("[cms] saveHomepageContent failed:", res.error);
    return { ok: false, errorKey: "cms.errors.saveFailed", detail: res.error };
  }

  revalidatePublicSite();
  return { ok: true, messageKey: "cms.homeSaved" };
}
