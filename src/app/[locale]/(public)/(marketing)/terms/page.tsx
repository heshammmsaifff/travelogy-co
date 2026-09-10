import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/shared/i18n/config";
import { getContentPage } from "@/modules/cms/infrastructure/content.repository";
import { ContentPageBody } from "@/modules/cms/presentation/content-page";

/** Public "terms" page. Content lives in `content_pages`; Phase 6 adds the editor. */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = await getContentPage("terms", locale);
  return page ? { title: page.title } : {};
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const page = await getContentPage("terms", locale);
  return <ContentPageBody page={page} />;
}
