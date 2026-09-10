import { getTranslations } from "next-intl/server";
import type { ContentPage } from "@/modules/cms/infrastructure/content.repository";

/**
 * Renders a static content page.
 *
 * The body is PLAIN TEXT split on blank lines, never HTML. Phase 6 hands this
 * field to a non-developer, and a field that is stored as text but rendered
 * with dangerouslySetInnerHTML is a stored-XSS hole waiting for its first
 * editor. Paragraph splitting gives readable output without that risk (§12).
 */
export async function ContentPageBody({ page }: { page: ContentPage | null }) {
  const t = await getTranslations("site");

  if (!page) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-sm text-ink-muted">{t("contentMissing")}</p>
      </main>
    );
  }

  // Split on a blank line, tolerating CR. A browser textarea submits CRLF per
  // the HTML spec, so anything saved through the Phase 6 editor arrives as
  // "\r\n\r\n" while the seeded copy uses "\n\n". Matching only the latter
  // rendered an edited page as one unbroken wall of text (§15, Phase 6).
  const paragraphs = page.body
    .split(/(?:\r?\n){2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{page.title}</h1>
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="text-pretty leading-7 text-ink-muted">
            {paragraph}
          </p>
        ))}
      </div>
    </main>
  );
}
