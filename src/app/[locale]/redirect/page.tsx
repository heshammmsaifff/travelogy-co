import { redirect } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { landingPathFor } from "@/modules/auth/domain/user";

/**
 * Post-login router.
 *
 * Sign-in cannot know where to send someone: the destination depends on their
 * role scope and account status, which live in the profile. Rather than make
 * the login action load all that, it lands everyone here and this page — which
 * has to read the profile anyway — forwards them.
 *
 * Also honours a `next` path captured by the proxy when an anonymous visitor
 * was bounced from a protected route, so they resume where they were going.
 */
export default async function RedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const user = await getCurrentUser();

  if (!user) redirect(`/${locale}/login`);

  // Only same-origin absolute paths are honoured, and only for an active user.
  // A `next` that begins with `//` is a protocol-relative URL to another host.
  if (user.status === "active" && next?.startsWith("/") && !next.startsWith("//")) {
    redirect(next);
  }

  redirect(`/${locale}${landingPathFor(user)}`);
}
