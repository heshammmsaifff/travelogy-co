import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Locale } from "@/shared/i18n/config";
import type { SaveHomepageContentInput } from "@/modules/cms/application/schemas";

/**
 * Reads for the public marketing site (CLAUDE.md §13, Phase 4).
 *
 * These run through the ordinary request-scoped client, with no session, so
 * they are governed by the same RLS policies a visitor's browser would hit:
 * only live banners and the three seeded pages are readable. Nothing here
 * depends on being called from a server component to stay safe — the database
 * is the boundary (§12).
 */

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  imagePublicId: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type ContentPage = {
  slug: string;
  title: string;
  /** Plain text. Rendered as paragraphs, never as HTML. */
  body: string;
};

export const CONTENT_SLUGS = ["about", "privacy", "terms"] as const;
export type ContentSlug = (typeof CONTENT_SLUGS)[number];

export function isContentSlug(value: string): value is ContentSlug {
  return (CONTENT_SLUGS as readonly string[]).includes(value);
}

/**
 * Live banners, in the order the admin set.
 *
 * The three conditions are stated HERE as well as in the RLS policy, and that
 * is not redundancy. `banners_manager_read` deliberately lets a
 * `cms.content.publish` holder read hidden and scheduled rows so they can work
 * on them — which meant the public homepage rendered a hidden banner **for the
 * editor who hid it**, and only for them. An editor checking their own work
 * would have seen a page no visitor ever saw.
 *
 * So the public page asks for exactly what the public may see, rather than
 * taking whatever the caller happens to be allowed. RLS is still the security
 * boundary; this is the page being specific about what it wants.
 *
 * Found by hiding a banner while signed in as a content editor and watching it
 * stay on the homepage (§15, Phase 6).
 */
export async function getActiveBanners(locale: Locale): Promise<Banner[]> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("banners")
    .select(
      "id, title_ar, title_en, subtitle_ar, subtitle_en, image_public_id, cta_label_ar, cta_label_en, cta_href",
    )
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("sort_order", { ascending: true })
    .limit(8);

  // A failed banner read must not take the homepage down with it — the page is
  // still complete without them.
  if (error || !data) return [];

  const ar = locale === "ar";
  return data.map((b) => ({
    id: b.id,
    title: ar ? b.title_ar : b.title_en,
    subtitle: (ar ? b.subtitle_ar : b.subtitle_en) ?? null,
    imagePublicId: b.image_public_id,
    ctaLabel: (ar ? b.cta_label_ar : b.cta_label_en) ?? null,
    ctaHref: b.cta_href,
  }));
}

export async function getContentPage(
  slug: ContentSlug,
  locale: Locale,
): Promise<ContentPage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug, title_ar, title_en, body_ar, body_en")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;

  const ar = locale === "ar";
  return {
    slug: data.slug,
    title: ar ? data.title_ar : data.title_en,
    body: ar ? data.body_ar : data.body_en,
  };
}

// ---------------------------------------------------------------- admin reads

export type AdminBanner = {
  id: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string | null;
  subtitleEn: string | null;
  imagePublicId: string | null;
  ctaLabelAr: string | null;
  ctaLabelEn: string | null;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
};

/**
 * Every banner, including the ones the public cannot see.
 *
 * The public policy hides disabled and scheduled banners; the manager policy
 * shows them to a `cms.content.publish` holder. That split is why an editor can
 * prepare a campaign without preannouncing it (§15, Phase 4).
 */
export async function listAllBanners(): Promise<AdminBanner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("banners")
    .select(
      "id, title_ar, title_en, subtitle_ar, subtitle_en, image_public_id, cta_label_ar, cta_label_en, cta_href, sort_order, is_active, starts_at, ends_at, updated_at",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  return data.map((b) => ({
    id: b.id,
    titleAr: b.title_ar,
    titleEn: b.title_en,
    subtitleAr: b.subtitle_ar,
    subtitleEn: b.subtitle_en,
    imagePublicId: b.image_public_id,
    ctaLabelAr: b.cta_label_ar,
    ctaLabelEn: b.cta_label_en,
    ctaHref: b.cta_href,
    sortOrder: b.sort_order,
    isActive: b.is_active,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    updatedAt: b.updated_at,
  }));
}

export type AdminContentPage = {
  slug: ContentSlug;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  updatedAt: string;
};

/** Both locales at once — the editor shows them side by side. */
export async function listContentPages(): Promise<AdminContentPage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug, title_ar, title_en, body_ar, body_en, updated_at")
    .order("slug");

  if (error || !data) return [];
  return data
    .filter((p): p is typeof p & { slug: ContentSlug } => isContentSlug(p.slug))
    .map((p) => ({
      slug: p.slug,
      titleAr: p.title_ar,
      titleEn: p.title_en,
      bodyAr: p.body_ar,
      bodyEn: p.body_en,
      updatedAt: p.updated_at,
    }));
}

// ----------------------------------------------------------- homepage content

export type PublicHomepageContent = {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  features: {
    title: string;
    description: string;
    items: {
      key: string;
      title: string;
      body: string;
    }[];
  };
  how: {
    title: string;
    steps: {
      step: string;
      title: string;
      body: string;
    }[];
  };
  cta: {
    title: string;
    body: string;
    button: string;
  };
};

export async function getHomepageContent(locale: Locale): Promise<PublicHomepageContent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homepage_content")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) return null;

  const ar = locale === "ar";
  const rawFeatures = (Array.isArray(data.features) ? data.features : []) as Record<string, unknown>[];
  const rawSteps = (Array.isArray(data.how_steps) ? data.how_steps : []) as Record<string, unknown>[];

  return {
    hero: {
      eyebrow: ar ? data.hero_eyebrow_ar : data.hero_eyebrow_en,
      title: ar ? data.hero_title_ar : data.hero_title_en,
      subtitle: ar ? data.hero_subtitle_ar : data.hero_subtitle_en,
    },
    features: {
      title: ar ? data.features_title_ar : data.features_title_en,
      description: ar ? data.features_subtitle_ar : data.features_subtitle_en,
      items: rawFeatures.map((f) => ({
        key: String(f.key ?? ""),
        title: ar ? String(f.title_ar ?? "") : String(f.title_en ?? ""),
        body: ar ? String(f.body_ar ?? "") : String(f.body_en ?? ""),
      })),
    },
    how: {
      title: ar ? data.how_title_ar : data.how_title_en,
      steps: rawSteps.map((s) => ({
        step: String(s.step ?? ""),
        title: ar ? String(s.title_ar ?? "") : String(s.title_en ?? ""),
        body: ar ? String(s.body_ar ?? "") : String(s.body_en ?? ""),
      })),
    },
    cta: {
      title: ar ? data.cta_title_ar : data.cta_title_en,
      body: ar ? data.cta_body_ar : data.cta_body_en,
      button: ar ? data.cta_button_ar : data.cta_button_en,
    },
  };
}

export type AdminHomepageContent = {
  heroEyebrowAr: string;
  heroEyebrowEn: string;
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;

  featuresTitleAr: string;
  featuresTitleEn: string;
  featuresSubtitleAr: string;
  featuresSubtitleEn: string;
  features: {
    key: string;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
  }[];

  howTitleAr: string;
  howTitleEn: string;
  howSteps: {
    step: string;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
  }[];

  ctaTitleAr: string;
  ctaTitleEn: string;
  ctaBodyAr: string;
  ctaBodyEn: string;
  ctaButtonAr: string;
  ctaButtonEn: string;
  updatedAt: string;
};

export async function getAdminHomepageContent(): Promise<AdminHomepageContent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homepage_content")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) return null;

  const rawFeatures = (Array.isArray(data.features) ? data.features : []) as Record<string, unknown>[];
  const rawSteps = (Array.isArray(data.how_steps) ? data.how_steps : []) as Record<string, unknown>[];

  return {
    heroEyebrowAr: data.hero_eyebrow_ar,
    heroEyebrowEn: data.hero_eyebrow_en,
    heroTitleAr: data.hero_title_ar,
    heroTitleEn: data.hero_title_en,
    heroSubtitleAr: data.hero_subtitle_ar,
    heroSubtitleEn: data.hero_subtitle_en,

    featuresTitleAr: data.features_title_ar,
    featuresTitleEn: data.features_title_en,
    featuresSubtitleAr: data.features_subtitle_ar,
    featuresSubtitleEn: data.features_subtitle_en,
    features: rawFeatures.map((f) => ({
      key: String(f.key ?? ""),
      titleAr: String(f.title_ar ?? f.titleAr ?? ""),
      titleEn: String(f.title_en ?? f.titleEn ?? ""),
      bodyAr: String(f.body_ar ?? f.bodyAr ?? ""),
      bodyEn: String(f.body_en ?? f.bodyEn ?? ""),
    })),

    howTitleAr: data.how_title_ar,
    howTitleEn: data.how_title_en,
    howSteps: rawSteps.map((s) => ({
      step: String(s.step ?? ""),
      titleAr: String(s.title_ar ?? s.titleAr ?? ""),
      titleEn: String(s.title_en ?? s.titleEn ?? ""),
      bodyAr: String(s.body_ar ?? s.bodyAr ?? ""),
      bodyEn: String(s.body_en ?? s.bodyEn ?? ""),
    })),

    ctaTitleAr: data.cta_title_ar,
    ctaTitleEn: data.cta_title_en,
    ctaBodyAr: data.cta_body_ar,
    ctaBodyEn: data.cta_body_en,
    ctaButtonAr: data.cta_button_ar,
    ctaButtonEn: data.cta_button_en,
    updatedAt: data.updated_at,
  };
}

export async function saveHomepageContent(
  input: SaveHomepageContentInput,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("homepage_content")
    .update({
      hero_eyebrow_ar: input.heroEyebrowAr,
      hero_eyebrow_en: input.heroEyebrowEn,
      hero_title_ar: input.heroTitleAr,
      hero_title_en: input.heroTitleEn,
      hero_subtitle_ar: input.heroSubtitleAr,
      hero_subtitle_en: input.heroSubtitleEn,

      features_title_ar: input.featuresTitleAr,
      features_title_en: input.featuresTitleEn,
      features_subtitle_ar: input.featuresSubtitleAr,
      features_subtitle_en: input.featuresSubtitleEn,
      features: input.features.map((f) => ({
        key: f.key,
        title_ar: f.titleAr,
        title_en: f.titleEn,
        body_ar: f.bodyAr,
        body_en: f.bodyEn,
      })) as unknown as import("@/shared/types/database").Json,

      how_title_ar: input.howTitleAr,
      how_title_en: input.howTitleEn,
      how_steps: input.howSteps.map((s) => ({
        step: s.step,
        title_ar: s.titleAr,
        title_en: s.titleEn,
        body_ar: s.bodyAr,
        body_en: s.bodyEn,
      })) as unknown as import("@/shared/types/database").Json,

      cta_title_ar: input.ctaTitleAr,
      cta_title_en: input.ctaTitleEn,
      cta_body_ar: input.ctaBodyAr,
      cta_body_en: input.ctaBodyEn,
      cta_button_ar: input.ctaButtonAr,
      cta_button_en: input.ctaButtonEn,

      updated_by: userId,
    })
    .eq("id", true);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
